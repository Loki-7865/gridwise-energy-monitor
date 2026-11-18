CREATE TABLE IF NOT EXISTS energy_measurements (
    id               BIGINT AUTO_INCREMENT PRIMARY KEY,
    measured_at      DATETIME(3) NOT NULL,
    source           ENUM('synthetic', 'esp32-pzem') NOT NULL,
    scenario         VARCHAR(64) NULL,

    -- Raw readings as received from the telemetry source.
    raw_voltage      DECIMAL(10, 3) NOT NULL,
    raw_current      DECIMAL(10, 4) NOT NULL,
    raw_power        DECIMAL(10, 3) NOT NULL,
    raw_energy       DECIMAL(14, 6) NOT NULL,
    raw_frequency    DECIMAL(10, 3) NOT NULL,
    raw_power_factor DECIMAL(8, 4) NOT NULL,

    -- Five-reading rolling averages. Energy remains the latest cumulative value.
    avg_voltage      DECIMAL(10, 3) NOT NULL,
    avg_current      DECIMAL(10, 4) NOT NULL,
    avg_power        DECIMAL(10, 3) NOT NULL,
    avg_energy       DECIMAL(14, 6) NOT NULL,
    avg_frequency    DECIMAL(10, 3) NOT NULL,
    avg_power_factor DECIMAL(8, 4) NOT NULL,
    samples_averaged TINYINT UNSIGNED NOT NULL,

    INDEX idx_measured_at (measured_at),
    INDEX idx_source_measured_at (source, measured_at)
)
