FROM valkey/valkey:8-alpine
RUN mkdir -p /usr/local/etc/valkey
RUN echo "maxmemory 200mb" > /usr/local/etc/valkey/valkey.conf
CMD [ "valkey-server", "/usr/local/etc/valkey/valkey.conf" ]