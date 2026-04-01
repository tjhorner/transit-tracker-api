FROM valkey/valkey:9-alpine
RUN mkdir -p /usr/local/etc/valkey
RUN echo "maxmemory 160mb" > /usr/local/etc/valkey/valkey.conf
CMD [ "valkey-server", "/usr/local/etc/valkey/valkey.conf" ]