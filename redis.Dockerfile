FROM valkey/valkey:9-alpine
RUN mkdir -p /usr/local/etc/valkey
RUN echo "maxmemory 358mb" > /usr/local/etc/valkey/valkey.conf && \
  echo "maxmemory-policy allkeys-lru" >> /usr/local/etc/valkey/valkey.conf
CMD [ "valkey-server", "/usr/local/etc/valkey/valkey.conf" ]