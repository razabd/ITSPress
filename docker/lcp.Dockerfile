# =============================================================================
# Readium LCP Server + LSD Server — Dockerfile
# Build context: ./readium-lcp-server (lihat docker-compose.yml)
# Satu image berisi dua binary; service memilih command lcpserver / lsdserver.
# =============================================================================

FROM golang:1.25-bookworm AS build
ENV GOTOOLCHAIN=local
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# CGO wajib: driver sqlite3 (mattn/go-sqlite3) dan go-fitz berbasis CGO
RUN CGO_ENABLED=1 go build -o /out/lcpserver ./lcpserver \
    && CGO_ENABLED=1 go build -o /out/lsdserver ./lsdserver

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/lcpserver /usr/local/bin/lcpserver
COPY --from=build /out/lsdserver /usr/local/bin/lsdserver
# Path config dibaca dari env READIUM_LCPSERVER_CONFIG / READIUM_LSDSERVER_CONFIG
ENV READIUM_LCPSERVER_CONFIG=/config/config.yaml \
    READIUM_LSDSERVER_CONFIG=/config/config.yaml
RUN mkdir -p /data/db /data/storage
CMD ["lcpserver"]
