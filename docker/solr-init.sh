#!/bin/bash
# Dev convenience, run by the Solr image at startup (it sources scripts in
# /docker-entrypoint-initdb.d). Solr's CoreAdmin CREATE API looks for configsets
# under SOLR_HOME/configsets, but the bundled _default configset ships in the
# install dir. Copy it across so dynamically-created cores can use it. Without
# this, createIndex fails with "Could not load configuration from directory
# .../configsets/_default".
set -e
SRC=/opt/solr/server/solr/configsets/_default
DEST="${SOLR_HOME:-/var/solr/data}/configsets"
mkdir -p "$DEST"
if [ ! -d "$DEST/_default" ]; then
  cp -a "$SRC" "$DEST/_default"
fi
