<?php
declare(strict_types=1);

namespace App\Drivers\Mikrotik;

use App\Drivers\Contracts\MikrotikDriverInterface;
use RuntimeException;

/**
 * Driver Real para MikroTik RouterOS API (Puerto 8728 / 8729 SSL)
 * Compatible con RouterOS v6.43+ y RouterOS v7.x (autenticación post-6.43).
 */
final class RouterOSApiDriver implements MikrotikDriverInterface
{
    /** @var resource|null */
    private $socket = null;
    private bool $connected = false;

    public function connect(string $ip, int $port, string $username, string $password, bool $useSsl = false): bool
    {
        $protocol = $useSsl ? 'ssl://' : 'tcp://';
        $errno = 0;
        $errstr = '';

        $this->socket = @stream_socket_client(
            "{$protocol}{$ip}:{$port}",
            $errno,
            $errstr,
            5.0,
            STREAM_CLIENT_CONNECT
        );

        if (!is_resource($this->socket)) {
            throw new RuntimeException("No se pudo conectar al Router MikroTik {$ip}:{$port} ({$errstr})");
        }

        stream_set_timeout($this->socket, 5);

        // Login directo RouterOS v6.43+ / v7+
        $this->writeWord('/login', false);
        $this->writeWord('=name=' . $username, false);
        $this->writeWord('=password=' . $password, true);

        $response = $this->readSentence();
        if (($response[0] ?? '') === '!done') {
            $this->connected = true;
            return true;
        }

        throw new RuntimeException("Credenciales MikroTik rechazadas en {$ip}:{$port}");
    }

    public function disconnect(): void
    {
        if (is_resource($this->socket)) {
            fclose($this->socket);
        }
        $this->socket = null;
        $this->connected = false;
    }

    public function getSystemResources(): array
    {
        return $this->command('/system/resource/print');
    }

    public function getInterfacesTraffic(): array
    {
        return $this->command('/interface/print');
    }

    public function createPppoeSecret(
        string $username,
        string $password,
        string $profile,
        string $remoteAddress = '',
        string $comment = ''
    ): bool {
        $args = [
            '=name=' . $username,
            '=password=' . $password,
            '=service=pppoe',
            '=profile=' . $profile,
        ];
        if ($remoteAddress !== '') {
            $args[] = '=remote-address=' . $remoteAddress;
        }
        if ($comment !== '') {
            $args[] = '=comment=' . $comment;
        }
        $this->command('/ppp/secret/add', $args);
        return true;
    }

    public function suspendPppoeUser(
        string $username,
        string $morosoProfile = 'CORTADOS_MOROSOS',
        string $addressList = 'MOROSOS_ISP'
    ): bool {
        // 1. Cambiar perfil PPPoE a perfil de corte o deshabilitar secret
        $this->command('/ppp/secret/set', [
            '=numbers=' . $username,
            '=profile=' . $morosoProfile,
        ]);

        // 2. Desconectar sesión PPPoE activa para aplicar el corte de inmediato
        $this->command('/ppp/active/remove', [
            '=numbers=' . $username,
        ]);

        return true;
    }

    public function reactivatePppoeUser(string $username, string $activeProfile): bool
    {
        $this->command('/ppp/secret/set', [
            '=numbers=' . $username,
            '=profile=' . $activeProfile,
            '=disabled=no',
        ]);
        $this->command('/ppp/active/remove', [
            '=numbers=' . $username,
        ]);
        return true;
    }

    public function syncSimpleQueue(
        string $name,
        string $targetIp,
        string $maxLimitUp,
        string $maxLimitDown,
        string $priority = '8/8'
    ): bool {
        $this->command('/queue/simple/add', [
            '=name=' . $name,
            '=target=' . $targetIp,
            '=max-limit=' . $maxLimitUp . '/' . $maxLimitDown,
            '=priority=' . $priority,
        ]);
        return true;
    }

    private function command(string $cmd, array $attributes = []): array
    {
        if (!$this->connected || !is_resource($this->socket)) {
            throw new RuntimeException('No hay sesión activa con MikroTik RouterOS.');
        }

        $count = count($attributes);
        $this->writeWord($cmd, $count === 0);
        foreach ($attributes as $idx => $attr) {
            $this->writeWord($attr, $idx === $count - 1);
        }

        return $this->readSentence();
    }

    private function writeWord(string $word, bool $isLast): void
    {
        $len = strlen($word);
        if ($len < 0x80) {
            fwrite($this->socket, chr($len));
        } elseif ($len < 0x4000) {
            $len |= 0x8000;
            fwrite($this->socket, chr(($len >> 8) & 0xFF) . chr($len & 0xFF));
        } else {
            $len |= 0xC00000;
            fwrite($this->socket, chr(($len >> 16) & 0xFF) . chr(($len >> 8) & 0xFF) . chr($len & 0xFF));
        }
        fwrite($this->socket, $word);
        if ($isLast) {
            fwrite($this->socket, chr(0));
        }
    }

    private function readSentence(): array
    {
        $sentence = [];
        while (true) {
            $byte = ord((string)fread($this->socket, 1));
            if ($byte === 0) {
                if (!empty($sentence) && ($sentence[0] === '!done' || $sentence[0] === '!trap')) {
                    break;
                }
                continue;
            }
            $word = fread($this->socket, $byte);
            $sentence[] = $word;
        }
        return $sentence;
    }
}
