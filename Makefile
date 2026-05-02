.PHONY: help start stop restart status logs logs-cron once signals live positions history whales discover dry-on dry-off

SHELL    := /bin/zsh
PNPM     := $(shell eval "$$(/opt/homebrew/bin/fnm env --shell bash 2>/dev/null)" && which pnpm 2>/dev/null)
PM2      := $(PNPM) exec pm2
DEV      := $(PNPM) dev

# ── default: show help ────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  Polymarket Bot — команды"
	@echo ""
	@echo "  Daemon (PM2)"
	@echo "    make start       — запустить monitor + cron"
	@echo "    make stop        — остановить всё"
	@echo "    make restart     — перезапустить (применяет .env)"
	@echo "    make status      — статус PM2 + последние сигналы"
	@echo "    make logs        — tail логов монитора"
	@echo "    make logs-cron   — tail логов крона"
	@echo ""
	@echo "  Тест"
	@echo "    make once        — один цикл монитора (без демона)"
	@echo ""
	@echo "  Мониторинг"
	@echo "    make signals     — последние 20 сигналов"
	@echo "    make live        — только реально исполненные ордера"
	@echo "    make positions   — открытые позиции"
	@echo "    make history     — все позиции + P&L"
	@echo "    make whales      — прибыльные киты"
	@echo "    make discover    — обновить список китов (Dune)"
	@echo ""
	@echo "  DRY_RUN"
	@echo "    make dry-on      — включить DRY_RUN=true"
	@echo "    make dry-off     — отключить DRY_RUN=false"
	@echo ""

# ── daemon ────────────────────────────────────────────────────────────────────
start:
	@$(PM2) start ecosystem.config.cjs
	@$(PM2) save

stop:
	@$(PM2) stop all

restart:
	@$(PM2) restart all --update-env

status:
	@$(PM2) status
	@echo ""
	@$(DEV) copy status -n 10

# ── logs ──────────────────────────────────────────────────────────────────────
logs:
	@$(PM2) logs polymarket-monitor --lines 50

logs-cron:
	@$(PM2) logs polymarket-cron --lines 50

# ── test cycle ────────────────────────────────────────────────────────────────
once:
	@$(DEV) copy start --once

# ── inspection ────────────────────────────────────────────────────────────────
signals:
	@$(DEV) copy status -n 20

live:
	@$(DEV) copy status --live

positions:
	@$(DEV) copy positions

history:
	@$(DEV) copy positions --history

whales:
	@$(DEV) whales top --profitable

discover:
	@$(DEV) whales discover

# ── dry run toggle ────────────────────────────────────────────────────────────
dry-on:
	@sed -i '' 's/^DRY_RUN=.*/DRY_RUN=true/' .env
	@grep DRY_RUN .env
	@echo "→ make restart чтобы применить"

dry-off:
	@sed -i '' 's/^DRY_RUN=.*/DRY_RUN=false/' .env
	@grep DRY_RUN .env
	@echo "→ make restart чтобы применить"
