# SEGEMPAT — Roadmap

## Pronto no projeto
- [x] Schema MySQL 8 completo (`database/mysql/001_schema.sql`)
- [x] API SEGEMPAT com todos os módulos (`server/src`)
- [x] Frontend API-only, sem fallback para backend legado
- [x] Runtime/build preparado para Cloudflare Workers
- [x] Scripts: preflight, migrate, smoke, bootstrap-admin, cutover:audit
- [x] Pacote de implantação: Dockerfile, docker-compose, serviço systemd, proxy Nginx
- [x] Documento de entrega para a TI (`ENTREGA_TI.md`)

## Depende da TI / ambiente corporativo
- [ ] Criar database/usuário MySQL corporativo e liberar rede
- [ ] Publicar a API em HTTPS interno e rodar preflight/migrate/smoke
- [ ] Informar a URL HTTPS da API para `VITE_SEGEMPAT_API_URL`
- [ ] Publicar o frontend Cloudflare com `VITE_SEGEMPAT_REQUIRE_API=true`
- [ ] Homologar ponta a ponta (`CORPORATE_HOMOLOGATION_CHECKLIST.md`)
