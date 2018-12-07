VERSION = $(shell cat package.json | sed -n 's/.*"version": "\([^"]*\)",/\1/p')
current_babel_eslint = $(shell cat package.json | sed -n 's/.*"babel-eslint": "\([^"]*\)",/\1/p')
current_eslint = $(shell cat package.json | sed -n 's/.*"eslint": "\([^"]*\)",/\1/p')
SHELL = /usr/bin/env bash



YELLOW=\033[0;33m
RED=\033[0;31m
WHITE=\033[0m
GREEN=\u001B[32m


version:
	@echo -e "Current version is $(GREEN) ${VERSION} $(WHITE) "

update_eslint:
	@echo  -e "Current eslint is $(GREEN)$(current_eslint)$(WHITE), current babel-eslint is $(GREEN)$(current_babel_eslint)$(WHITE)" ;\
	npm remove --save-dev eslint babel-eslint ;\
	npm install --save-dev eslint babel-eslint

default: install
.PHONY: default install run fix-permissions  tag version
.PHONY: build test


install:
	npm  install

docs:
	@node generate_docs.js

test:
	@DEBUG=node-google-drive:* node test/test.js

fix-permissions:
	chown  ubuntu:ubuntu . -R


update_version:
	@echo -e "Current version is $(GREEN) ${VERSION} $(WHITE) "
	@echo -e "Next version will be $(YELLOW) ${v} $(WHITE) "
	sed -i s/'"version": "$(VERSION)"'/'"version": "$(v)"'/g package.json

tag_and_push:
		git add --all
		git commit -a -m "Tag v $(v) $(m)"
		git tag v$(v)
		git push
		git push --tags
		npm publish


tag: update_version docs test tag_and_push
