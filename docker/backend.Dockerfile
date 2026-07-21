# =============================================================================
# ITSPress Backend CMS — Dockerfile
# Build context: root repo (berisi backend-cms/ dan readium-lcp-server/)
#   docker build -f docker/backend.Dockerfile .
#
# Catatan: folder readium-lcp-server/ di-gitignore. Clone dulu ke root repo:
#   git clone https://github.com/readium/readium-lcp-server.git
# =============================================================================

# ─── Stage 1: build lcpencrypt (butuh CGO karena go-fitz/MuPDF) ──────────────
FROM golang:1.25-bookworm AS lcpencrypt-build
ENV GOTOOLCHAIN=local
WORKDIR /src
COPY readium-lcp-server/go.mod readium-lcp-server/go.sum ./
RUN go mod download
COPY readium-lcp-server/ .
RUN CGO_ENABLED=1 go build -o /out/lcpencrypt ./lcpencrypt

# ─── Stage 2: build backend ITSPress ─────────────────────────────────────────
FROM golang:1.25-bookworm AS backend-build
ENV GOTOOLCHAIN=local
WORKDIR /src
COPY backend-cms/go.mod backend-cms/go.sum ./
RUN go mod download
COPY backend-cms/ .
RUN CGO_ENABLED=0 go build -o /out/itspress-backend . \
    && CGO_ENABLED=0 go build -o /out/itspress-seed seed.go

# ─── Stage 3: runtime ────────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends mupdf-tools ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=lcpencrypt-build /out/lcpencrypt /usr/local/bin/lcpencrypt
COPY --from=backend-build /out/itspress-backend /app/itspress-backend
COPY --from=backend-build /out/itspress-seed /app/itspress-seed
EXPOSE 8081
CMD ["/app/itspress-backend"]
