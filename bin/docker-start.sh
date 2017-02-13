#!/bin/bash

set -e

runtimeEnv=$(uname)

if [ "$runtimeEnv" != "Linux" ] || [ ! -f /.dockerenv ]; then
    echo "Do not use this script in non-dockerized environments."
    echo "Detected non-Linux runtime $runtimeEnv, or /.dockerenv is not present."
    echo "Use 'node bin/api' or 'npm start'.'"
    exit 1
fi

if [ ! -z "$GIT_REPO" ]; then

    tmpDir=$(mktemp -d)

    echo "Cloning configuration repository from $GIT_REPO into $tmpDir..."
    pushd $tmpDir

    if [ ! -z "$GIT_BRANCH" ] && [ ! -z "$GIT_REVISION" ]; then
        echo "===================================================================================="
        echo "ERROR: GIT_REVISION and GIT_BRANCH are mutually exclusive (both are defined)!"
        echo "===================================================================================="
        exit 1
    fi

    if [ -z "$GIT_BRANCH" ]; then
        echo "Checking out branch 'master'..."
        if [ ! -z "$GIT_CREDENTIALS" ]; then
            git clone https://${GIT_CREDENTIALS}@${GIT_REPO} .
        else
            echo "Assuming public repository, GIT_CREDENTIALS is empty"
            git clone https://${GIT_REPO} .
        fi
    else
        echo "Checking out branch '$GIT_BRANCH'..."
        if [ ! -z "$GIT_CREDENTIALS" ]; then
            git clone https://${GIT_CREDENTIALS}@${GIT_REPO} --branch ${GIT_BRANCH} .
        else
            echo "Assuming public repository, GIT_CREDENTIALS is empty"
            git clone https://${GIT_REPO} --branch ${GIT_BRANCH} .
        fi
    fi

    if [ ! -z "$GIT_REVISION" ]; then
        echo "Checking out specific revision with SHA ${GIT_REVISION}..."
        git checkout $GIT_REVISION
    fi

    if [ ! -d "$tmpDir/static" ]; then
        echo "===================================================================================="
        echo "ERROR: Could not find directory 'static' in $tmpDir, wrong repository?"
        echo "===================================================================================="
        exit 1
    fi

    echo Adding metadata to static directory...
    git log -1 > static/last_commit
    date -u "+%Y-%m-%d %H:%M:%S" > static/build_date

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

echo "Calculating config hash..."

pushd /var/portal-api/static
tempMd5Hash=$(find . -type f -exec md5sum {} \; | sort -k 2 | md5sum)
printf ${tempMd5Hash:0:32} > /var/portal-api/static/confighash
echo "Hash: $(cat /var/portal-api/static/confighash)"
popd

echo "Setting owner of /var/portal-api to wicked:wicked"
chown -R wicked:wicked /var/portal-api

echo "Starting API..."

# Use gosu to start node as the user "wicked"
gosu wicked node bin/api
