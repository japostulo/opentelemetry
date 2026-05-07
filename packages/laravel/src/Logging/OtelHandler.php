<?php

namespace Haoc\OpenTelemetry\Logging;

use Monolog\Handler\AbstractProcessingHandler;
use Monolog\Level;
use Monolog\LogRecord;
use OpenTelemetry\API\Logs\LoggerInterface;
use OpenTelemetry\API\Logs\LogRecord as OtelLogRecord;
use OpenTelemetry\API\Logs\Severity;

class OtelHandler extends AbstractProcessingHandler
{
    private const MONOLOG_TO_OTEL = [
        Level::Debug->value     => Severity::DEBUG,
        Level::Info->value      => Severity::INFO,
        Level::Notice->value    => Severity::INFO2,
        Level::Warning->value   => Severity::WARN,
        Level::Error->value     => Severity::ERROR,
        Level::Critical->value  => Severity::FATAL,
        Level::Alert->value     => Severity::FATAL2,
        Level::Emergency->value => Severity::FATAL4,
    ];

    /**
     * @param bool|null $emitToOtlp  When `null`, emission is decided at
     *                                runtime by reading
     *                                `config('haoc-otel.log_destination')`.
     *                                When `true`/`false`, this overrides
     *                                the runtime config (mainly for tests).
     */
    public function __construct(
        private readonly LoggerInterface $otelLogger,
        int|string|Level $level = Level::Debug,
        bool $bubble = true,
        private readonly ?bool $emitToOtlp = null,
    ) {
        parent::__construct($level, $bubble);
    }

    /**
     * Re-evaluated on every write so `/admin/config` can flip the log
     * destination at runtime without re-creating the handler / Monolog
     * channel / LoggerProvider.
     */
    private function shouldEmit(): bool
    {
        if ($this->emitToOtlp !== null) {
            return $this->emitToOtlp;
        }
        $destination = config('haoc-otel.log_destination', 'both');
        return !in_array($destination, ['console', 'none'], true);
    }

    protected function write(LogRecord $record): void
    {
        if (!$this->shouldEmit()) {
            return;
        }

        $severity = self::MONOLOG_TO_OTEL[$record->level->value] ?? Severity::INFO;

        $otelRecord = (new OtelLogRecord($record->message))
            ->setTimestamp((int) ($record->datetime->format('U.u') * 1_000_000_000))
            ->setSeverityNumber($severity)
            ->setSeverityText($record->level->name);

        $attributes = [
            // Stamped per-record so runtime /admin/config flips reflect
            // immediately (Resource attrs are immutable post-init).
            'haoc.otel.profile' => (string) config('haoc-otel.profile', 'minimal'),
        ];
        foreach ($record->context as $key => $value) {
            if (is_scalar($value)) {
                $attributes[$key] = $value;
            } elseif (is_array($value)) {
                foreach ($this->flattenArray($key, $value) as $fk => $fv) {
                    $attributes[$fk] = $fv;
                }
            }
        }

        if (!empty($attributes)) {
            $otelRecord->setAttributes($attributes);
        }

        $this->otelLogger->emit($otelRecord);
    }

    private function flattenArray(string $prefix, array $data, int $depth = 0): array
    {
        if ($depth > 3) {
            return [];
        }

        $result = [];
        foreach ($data as $key => $value) {
            $attrKey = "{$prefix}.{$key}";
            if (is_scalar($value)) {
                $result[$attrKey] = (string) $value;
            } elseif (is_array($value)) {
                $result = array_merge($result, $this->flattenArray($attrKey, $value, $depth + 1));
            }
        }
        return $result;
    }
}
