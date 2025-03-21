#!/bin/bash

echo "This script will initialize the database with the schema for GTFS feeds. Do you want to continue? (y/n)"
read -r answer
if [[ "$answer" != "y" ]]; then
  echo "Exiting."
  exit 0
fi

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is not set. Please set it to the database connection string."
  exit 1
fi

set -e

echo "Creating 'gtfs' database..."
psql "$DATABASE_URL" -c "CREATE DATABASE gtfs;"

echo "Running schema migration..."
psql "$DATABASE_URL/gtfs" -f src/modules/gtfs/db/schema.sql

echo "Generating password for gtfs user..."
GTFS_USER_PASSWORD=$(openssl rand -hex 32)

echo "Setting password for gtfs user..."
echo "ALTER USER gtfs WITH PASSWORD :'pwd'" | psql "$DATABASE_URL" -v pwd=$GTFS_USER_PASSWORD

echo "Done!"
echo "GTFS user password: $GTFS_USER_PASSWORD"
