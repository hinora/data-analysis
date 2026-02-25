#!/bin/bash

echo "Link lib node_modules (from global) to this local directory ($PWD)"

# On CI/CD environment, NODE_PATH is not set so we need to assign default value
NODE_PATH=${NODE_PATH:-$(npm root -g)}

mkdir -p ./node_modules
ln -sf "$NODE_PATH"/core.lib ./node_modules
