#!/bin/sh

while [[ $# -gt 0 ]]; do
  case $1 in
    --app)
      APP_NAME="$2"
      shift 2
      ;;
    --size)
      SIZE="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

echo "Getting machines for $APP_NAME"
MACHINE_IDS=$(fly machine list -a $APP_NAME --json | jq -r '.[] | .id')

if [ -z "$MACHINE_IDS" ]; then
  echo "No machines found for app $APP_NAME"
  exit 1
fi

echo "Scaling $APP_NAME to $SIZE"

for MACHINE_ID in $MACHINE_IDS; do
  fly machine cordon -a $APP_NAME $MACHINE_ID
  fly machine update -y -a $APP_NAME $MACHINE_ID --vm-size $SIZE --wait-timeout 120

  if [ $? -ne 0 ]; then
    echo "Failed to scale machine $MACHINE_ID; trying restart"
    fly machine restart -a $APP_NAME $MACHINE_ID

    if [ $? -ne 0 ]; then
      echo "Failed to restart machine $MACHINE_ID"
      exit 1
    else
      echo "Successfully restarted machine $MACHINE_ID"
    fi
  fi

  fly machine uncordon -a $APP_NAME $MACHINE_ID
done
