#!/bin/bash

set -x
NODE_ENV=portal_local PORTAL_CONFIG_BASE=../wicked-sample-config LOG_LEVEL=debug node bin/api
