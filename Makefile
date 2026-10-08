#
# oda-veranstaltungskalender
# (C) Ondics, 2026
#

# aktuelles Dir ist docker-compose project name
mkfile_path := $(abspath $(lastword $(MAKEFILE_LIST)))
current_dir := $(notdir $(patsubst %/,%,$(dir $(mkfile_path))))

DC_BIN = docker compose
DC_FILES = -f docker-compose.yml
ifeq ($(STANDALONE),true)
DC_FILES := ${DC_FILES} -f docker-compose.standalone.yml
endif

DC = ${DC_BIN} ${DC_FILES}

# help-systematik
# build muss phony sein (forcierter build), weil es
# als verzeichnis existiert und sonst nie gebaut werden w�rde
.PHONY: help up down down-volumes logs build bash ps config zip check-app

help:
	@echo "# ${current_dir}"
	@echo "# Ondics, 2026"
	@echo "# dir = ${current_dir}"
	@echo Befehle: make ...
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.DEFAULT_GOAL := help

# allgemeine Befehle
up: ## App starten (Standalone mit STANDALONE=true)
	${DC} up -d --build --remove-orphans

down: ## App stoppen (Standalone mit STANDALONE=true)
	${DC} down

down-volumes: ## Container stopen, Volumes löschen
	${DC} down --volumes

logs: ## Show logs of all containers (stop with ctrl-c)
	${DC} logs -f -t --tail=100

build:  ## Build all containers
	${DC} build

bash: ## Bash in frontend-container
	${DC} exec oda-app sh

ps: ## what's up?
	${DC} ps

config: ## show docker-compose config 
	${DC} config

zip: ## App zur Auslieferung vorbereiten
	@set -eu; \
	archive="${current_dir}.zip"; \
	tmp_dir=$$(mktemp -d ".${current_dir}.zip.tmp.XXXXXX"); \
	trap 'rm -rf "$$tmp_dir"' EXIT; \
	trap 'exit 1' HUP INT TERM; \
	if zip -r "$$tmp_dir/$$archive" app assets app-package.json CHANGELOG.md LICENSE; then \
		mv -f "$$tmp_dir/$$archive" "$$archive"; \
	else \
		status=$$?; \
		exit "$$status"; \
	fi

check-app: ## App prüfen mit Skript aus ODAS-Tools
	@if [ ! -x ../odas-tools/app-check.sh ]; then \
		echo "Required external tool ../odas-tools/app-check.sh is missing; make check-app requires the sibling odas-tools checkout." >&2; \
		exit 1; \
	fi
	@../odas-tools/app-check.sh