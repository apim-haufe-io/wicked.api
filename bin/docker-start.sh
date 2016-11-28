#!/bin/bash

set -e

runtimeEnv=$(uname)

if [ "$runtimeEnv" != "Linux" ] || [ ! -f /.dockerenv ]; then
    echo "Do not use this script in non-dockerized environments."
    echo "Detected non-Linux runtime $runtimeEnv, or /.dockerenv is not present."
    echo "Use 'node bin/api' or 'npm start'.'"
    exit 1
fi

exit 1

if [ ! -z "$GIT_CREDENTIALS" ] && [ ! -z "$GIT_REPO" ]; then

    tmpDir=$(mktemp -d)

    echo "Cloning configuration repository from $GIT_REPO into $tmpDir..."
    pushd $tmpDir

    if [ -z "$GIT_BRANCH" ]; then
        echo "Checking out branch 'master'..."
        git clone https://${GIT_CREDENTIALS}@${GIT_REPO} --depth 1 .
    else
        echo "Checking out branch '$GIT_BRANCH'..."
        git clone https://${GIT_CREDENTIALS}@${GIT_REPO} --depth 1 --branch ${GIT_BRANCH} .
    fi

    if [ ! -d "$tmpDir/static" ]; then
        echo "===================================================================================="
        echo "ERROR: Could not find directory 'static' in $tmpDir, wrong repository?"
        echo "===================================================================================="
        exit 1
    fi

    echo "Cleaning up old configuration (if applicable)"
    rm -rf /var/portal-api/static
    echo "Copying configuration to /var/portal-api/static"
    cp -R static /var/portal-api
    echo "Done."

    popd

    echo "Cleanining up temp dir."
    rm -rf $tmpDir

else
    echo "Assuming /var/portal-api/static is prepopulated, not cloning configuration repo."
fi

echo "Starting API..."

npm start
