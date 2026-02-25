#!/bin/bash

PROJECT_DIR=$(cd "$(dirname "$0")" && pwd)
echo "PROJECT_DIR=$PROJECT_DIR"

current_working_dir=$PWD
echo "current_working_dir = $current_working_dir"

echo "Link lib packages to global node_modules directory"

link_lib() {
  local lib_dir=$1
  echo "Link lib ($lib_dir)"

  # Get package name from package.json
  local package_name=$(node -p "require('$PROJECT_DIR/$lib_dir/package.json').name")

  # Remove existing symlink or directory in node_modules
  if [ -e "$PROJECT_DIR/node_modules/$package_name" ]; then
    echo "  Removing existing $package_name (symlink or directory)..."
    rm -rf "$PROJECT_DIR/node_modules/$package_name"
  fi

  # shellcheck disable=SC2164
  cd "$PROJECT_DIR"/"$lib_dir"
  npm link
}

link_lib "lib"

# Link lib node_modules to this local directory
cd "$PROJECT_DIR" && . ./link-lib-to-local.sh

cd "$current_working_dir"
