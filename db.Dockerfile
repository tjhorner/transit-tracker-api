FROM postgres:18
RUN apt-get update && apt-get install -y tzdata-legacy
