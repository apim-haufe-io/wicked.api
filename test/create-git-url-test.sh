#!/usr/bin/env bash

# import function under test
. ../bin/create-git-url.sh

# inputs
URL_HTTP="http://bla.com"
URL_HTTPS="https://bla.com"
URL_NAKED="bla.com"

CREDENTIALS="user:password"

# expected results
URL_HTTP_FULL="http://user:password@bla.com"
URL_HTTPS_FULL="https://user:password@bla.com"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

test_git_url () {
	expected=$1
	create_git_url $2 $3

	result=${GIT_URL}

	if [ "$expected" = "$result" ]; then
		echo -e "${GREEN}SUCCESS${NC}"
	else
		echo -e "${RED}FAILURE${NC}"
		echo "expected $expected but got $result"
	fi
}

test_git_url ${URL_HTTP} ${URL_HTTP}
test_git_url ${URL_HTTPS} ${URL_HTTPS}
test_git_url ${URL_HTTPS} ${URL_NAKED}

test_git_url ${URL_HTTP_FULL} ${URL_HTTP} ${CREDENTIALS}
test_git_url ${URL_HTTPS_FULL} ${URL_HTTPS} ${CREDENTIALS}
test_git_url ${URL_HTTPS_FULL} ${URL_NAKED} ${CREDENTIALS}

