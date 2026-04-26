.PHONY: start stop restart status logs

LOG_FILE := logs/bot.log
BOT_CMD  := src/index.ts copy start

start:
	@if pgrep -qf "$(BOT_CMD)"; then \
		echo "⚠️  Bot already running (PID $$(pgrep -f '$(BOT_CMD)' | head -1))"; \
		exit 1; \
	fi
	@mkdir -p logs
	@caffeinate -i pnpm dev copy start >> $(LOG_FILE) 2>&1 &
	@sleep 3
	@if pgrep -qf "$(BOT_CMD)"; then \
		echo "✅ Bot started (PID $$(pgrep -f '$(BOT_CMD)' | head -1))"; \
	else \
		echo "❌ Bot failed to start — last 20 lines:"; \
		tail -20 $(LOG_FILE); \
		exit 1; \
	fi

stop:
	@if pgrep -qf "$(BOT_CMD)"; then \
		pkill -f "$(BOT_CMD)" && echo "🛑 Bot stopped"; \
	else \
		echo "Bot is not running"; \
	fi

restart: stop
	@sleep 1
	@$(MAKE) start

status:
	@if pgrep -qf "$(BOT_CMD)"; then \
		echo "✅ Running  PID: $$(pgrep -f '$(BOT_CMD)' | head -1)"; \
	else \
		echo "❌ Not running"; \
	fi
	@echo ""
	@echo "Last 5 log entries:"
	@tail -5 $(LOG_FILE) 2>/dev/null | python3 -c \
		"import sys,json; [print(json.loads(l).get('msg','')) for l in sys.stdin if l.strip()]" \
		2>/dev/null || tail -5 $(LOG_FILE) 2>/dev/null

logs:
	@tail -f $(LOG_FILE)
