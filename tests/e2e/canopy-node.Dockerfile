# Builds a minimal canopy node binary for canopy-mcp's e2e test suite.
#
# Adapted from canopy-network/canopy's own .docker/Dockerfile — trimmed to skip the
# wallet/explorer frontend builds (make build/wallet, make build/explorer), which are
# unused here since these tests only talk to the node's RPC/admin-RPC endpoints.
#
# Build context must be the canopy-network/canopy source tree (main/), not this repo —
# see tests/e2e/docker-compose.yaml, which points `build.context` at a sibling checkout.

FROM golang:1.26-alpine AS builder

WORKDIR /go/src/github.com/canopy-network/canopy
COPY . /go/src/github.com/canopy-network/canopy

RUN CGO_ENABLED=0 GOOS=linux go build -a -o /app/canopy ./cmd/main/...

FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /app/canopy ./canopy
ENTRYPOINT ["/app/canopy"]
