#!/usr/bin/env bash
# Выкладка на общую машину. Ни ssh, ни git там нет: архив едет через S3, а
# распаковывает его ssm. Сборки нет — уезжает ровно то, что лежит в site/.
set -euo pipefail

PROFILE=credits
REGION=eu-central-1
INSTANCE=i-0f31d84610122dc7e
BUCKET=bookkicker-migration-985539780893
NAME=md
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Сначала сборка: наружу уезжает dist с запечённым текстом и мета-тегами,
# а не исходный шаблон, в котором вместо текста пусто.
node "$HERE/tools/build.mjs"

STAMP=$(date +%Y%m%d-%H%M%S)
TAR="/tmp/${NAME}-${STAMP}.tar.gz"
# COPYFILE_DISABLE: иначе tar с макоси кладёт рядом файлы ._app.js с
# ресурсными вилками, и они уезжают на сервер вместе с сайтом.
COPYFILE_DISABLE=1 tar -czf "$TAR" -C "$HERE/dist" .
aws s3 cp "$TAR" "s3://${BUCKET}/ai/${NAME}.tar.gz" --profile "$PROFILE" --region "$REGION" >/dev/null
echo "загружено: $(du -h "$TAR" | cut -f1)"

# Каждый элемент commands — одна строка, и \n здесь не разворачивается.
COMMAND=$(aws ssm send-command \
  --profile "$PROFILE" --region "$REGION" \
  --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --parameters "commands=[
    \"set -e\",
    \"mkdir -p /opt/${NAME}/site\",
    \"aws s3 cp s3://${BUCKET}/ai/${NAME}.tar.gz /tmp/${NAME}.tar.gz\",
    \"tar -xzf /tmp/${NAME}.tar.gz -C /opt/${NAME}/site\",
    \"rm -f /tmp/${NAME}.tar.gz\",
    \"ls -la /opt/${NAME}/site\",
    \"md5sum /opt/${NAME}/site/app.js /opt/${NAME}/site/marked.min.js\"
  ]" \
  --query 'Command.CommandId' --output text)

for _ in $(seq 1 30); do
  STATUS=$(aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
    --command-id "$COMMAND" --instance-id "$INSTANCE" --query 'Status' --output text 2>/dev/null || echo Pending)
  [[ "$STATUS" == "InProgress" || "$STATUS" == "Pending" ]] || break
  sleep 2
done

aws ssm get-command-invocation --profile "$PROFILE" --region "$REGION" \
  --command-id "$COMMAND" --instance-id "$INSTANCE" \
  --query 'StandardOutputContent' --output text
echo "статус: $STATUS"

# Caddy отдаёт каталог напрямую, перезапускать его не нужно. Но проверить, что
# уехало именно то, что лежит локально, нужно всегда: раздача статики отвечает
# двухсоткой одинаково, что с новыми файлами, что со старыми.
echo "локально:  $(md5 -q "$HERE/dist/app.js" 2>/dev/null || md5sum "$HERE/dist/app.js" | cut -d' ' -f1)"
