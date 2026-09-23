# The backup sidecar: pg_dump from Postgres 16, mc to ship the dump to MinIO.
#
# mc is copied from the MinIO client image at build time. It used to be
# downloaded from dl.min.io every time the container started; on 2026-09-23
# that URL answered 410 Gone, the sidecar restart-looped on the error page it
# had saved as "mc", and no backup was taken. MinIO's images are no longer on
# Docker Hub either, so the client comes from quay.io, as the server does.
FROM quay.io/minio/mc:latest AS mc

FROM postgres:16-alpine
RUN apk add --no-cache gzip
COPY --from=mc /usr/bin/mc /usr/local/bin/mc
