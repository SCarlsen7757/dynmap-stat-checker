# Dynmap render monitor

An always-on, read-only web dashboard for Dynmap's tile queue and render statistics. A small Fastify service polls `dynmap stats` over Minecraft RCON and stores queue history in PostgreSQL.

## Requirements

- Node.js 22+ for local development, or Docker.
- PostgreSQL 14+ when running outside the supplied Docker Compose stack.
- Minecraft Java and Dynmap with RCON enabled.
- Network access from the dashboard container to Minecraft's RCON port.

In `server.properties`:

```properties
enable-rcon=true
rcon.port=25575
rcon.password=use-a-long-random-password
```

Do not publish `25575` from the Minecraft container. Both services only need to share a private Docker network.

## Docker Compose

Copy `.env.example` to `.env`, then set:

- `RCON_HOST` to the Minecraft Compose service name, normally `minecraft`.
- `RCON_PASSWORD` to the value in `server.properties`.
- `DATABASE_URL` to the PostgreSQL connection string. The example targets the supplied `postgres` service.
- `POSTGRES_PASSWORD` to the database password represented in `DATABASE_URL` (URL-encode special characters only inside the URL).
- `DASHBOARD_BIND_ADDRESS` to the Docker host's LAN address, not `0.0.0.0` if the host has a public interface.
- `MINECRAFT_NETWORK_NAME` to the Docker network shared with Minecraft.

The supplied Compose file expects that shared network to already exist:

```sh
docker compose -f compose.example.yml up -d --build
```

If adding the service directly to the same Compose file as Minecraft, copy the `dynmap-stats` service into that file and attach it to the same non-external network. Docker DNS then resolves `RCON_HOST=minecraft`. No `depends_on` is required because the monitor keeps retrying while Minecraft starts.

Open `http://<DASHBOARD_BIND_ADDRESS>:<DASHBOARD_PORT>` from your LAN. The dashboard has no login and should not be exposed through router port forwarding.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `RCON_HOST` | yes | — | Minecraft host or Compose service name |
| `RCON_PASSWORD` | yes | — | RCON password; never returned by the API or intentionally logged |
| `DATABASE_URL` | yes | — | PostgreSQL connection string, for example `postgresql://dynmap:password@postgres:5432/dynmap` |
| `RCON_PORT` | no | `25575` | Minecraft RCON TCP port |
| `POLL_INTERVAL_SECONDS` | no | `15` | Poll interval, from 5 to 3600 seconds |
| `HISTORY_DAYS` | no | `30` | PostgreSQL retention and maximum API range, from 1 to 3650 days |
| `RCON_TIMEOUT_MS` | no | `5000` | Per-request deadline, from 1000 to 30000 ms |
| `PORT` | no | `3000` | HTTP port inside the container |

PostgreSQL stores one timestamp, base queue value, and zoom queue value for each successful poll. The service creates the table automatically. Rows older than `HISTORY_DAYS` are deleted at startup and then at most once per day during successful polling. PostgreSQL aggregates API results into five-minute buckets for the latest two days and hourly buckets for longer ranges. A failed RCON or database write leaves a visible gap, keeps the last valid sample on screen, and marks it stale.

## API

- `GET /api/stats/latest` — connection state and latest parsed response.
- `GET /api/stats/history?days=7` — downsampled queue history within configured retention.
- `GET /healthz` — process liveness; stays healthy if Minecraft is down.
- `GET /readyz` — returns 200 only after a recent successful sample.

There is no general-purpose command endpoint, so the browser cannot send RCON commands.

## Development

```sh
npm install
npm run dev
```

The API requires `RCON_HOST`, `RCON_PASSWORD`, and `DATABASE_URL`. Vite runs on port 5173 and proxies API requests to port 3000.

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run test:full-stack
```

`test:full-stack` uses Docker Desktop to build a disposable dashboard stack with PostgreSQL and a fake Minecraft RCON server. It verifies polling, database persistence, API history, restart behavior, and automatic retention cleanup, then removes the test containers and volume.

If the dashboard reports a parser error, compare the output of `dynmap stats` in the Minecraft console with the supported queue format. The command sent through RCON does not include a leading slash.
