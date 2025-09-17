CREATE TABLE IF NOT EXISTS devices(
  device_id text PRIMARY KEY,
  alias text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS readings(
  device_id  text REFERENCES devices(device_id),
  ts         timestamptz NOT NULL,
  f_cnt      int,
  temperature_c  numeric,
  pressure_bar   numeric,
  rssi       int,
  snr        numeric,
  gateway_id text,
  PRIMARY KEY (device_id, f_cnt)
);

CREATE TABLE IF NOT EXISTS gateways(
  gateway_id text PRIMARY KEY,
  name text,
  lat double precision,
  lon double precision,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS readings_device_ts_desc ON readings (device_id, ts DESC);
