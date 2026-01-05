#!/bin/sh

set -e

fly deploy $@

FLY_MACHINES=$(fly machine list --json)
SYNC_MACHINE_ID=$(echo $FLY_MACHINES | jq -r '.[] | select(.config.metadata.scheduled_sync_runner == "true") | .id')
LATEST_IMAGE=$(echo $FLY_MACHINES | jq -r '[.[] | select(.config.metadata.fly_process_group == "app")] | sort_by(.updated_at)[0] | .image_ref | .registry + "/" + .repository + ":" + .tag')

fly machine update -y -i $LATEST_IMAGE $SYNC_MACHINE_ID
