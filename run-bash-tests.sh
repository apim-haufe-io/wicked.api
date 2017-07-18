#!/usr/bin/env bash
echo Running bash tests

pushd test
for f in *.sh
do
	echo "Running $f"
	./${f}
done
popd