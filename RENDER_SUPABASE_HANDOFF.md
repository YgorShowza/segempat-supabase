# SEGEMPAT Supabase · Homologação da API no Render

Este arquivo prepara uma opção **gratuita de homologação** para a API Node/Express da edição `segempat-supabase`.

O `render.yaml` usa um Web Service Free, com `autoDeployTrigger: off`. Portanto, incorporar este arquivo ao repositório **não publica a aplicação automaticamente**.

## Arquitetura desta edição

`Frontend -> API SEGEMPAT no Render -> PostgreSQL Supabase`

Evidências privadas:

`API SEGEMPAT -> Supabase Storage S3 -> bucket privado segempat-evidence`

O navegador não recebe senha do PostgreSQL, credencial S3 nem acesso direto às tabelas do banco.

## Secrets que devem ser cadastrados no Render

Não coloque os valores abaixo em Git, chat, documentação pública ou variáveis `VITE_*`.

- `DATABASE_URL`: conexão de runtime do papel `segempat_app`. Preferir o **Session Pooler** do Supabase para o serviço hospedado. O usuário deve receber uma senha privada antes da homologação.
- `SEGEMPAT_ALLOWED_ORIGINS`: origem HTTPS exata do frontend de homologação/produção.
- `SUPABASE_STORAGE_S3_ACCESS_KEY_ID`: Access Key ID criado em Storage > S3 Configuration.
- `SUPABASE_STORAGE_S3_SECRET_ACCESS_KEY`: Secret Access Key correspondente, exclusiva do backend.

`SEGEMPAT_SESSION_SECRET` é gerado pelo próprio Render no Blueprint.

## O que não deve ficar no runtime permanente

`SEGEMPAT_MIGRATION_DATABASE_URL` é uma credencial administrativa temporária para migrations. Ela não faz parte do Blueprint e não deve permanecer no serviço da API depois da etapa de migration.

A API de runtime deve operar apenas com a identidade `segempat_app`, de menor privilégio.

## Sequência para a primeira homologação

1. Criar o Blueprint/Web Service a partir do `render.yaml` e manter o deploy automático desligado.
2. Definir uma senha privada para `segempat_app` e cadastrar a `DATABASE_URL` no secret manager do Render.
3. Gerar uma credencial S3 específica do backend e cadastrar as duas variáveis S3 no Render.
4. Cadastrar `SEGEMPAT_ALLOWED_ORIGINS` com a URL HTTPS exata do frontend.
5. Executar migrations somente com a credencial separada de migration, conferir checksums e remover essa credencial do ambiente operacional.
6. Fazer o primeiro deploy manual da API.
7. Validar `/health` e `/health/ready`.
8. Executar preflight, smoke, autenticação, papéis Master/Admin/Inspetor/Operador, assinatura de prova, evidência de ocorrência, auditoria e revogação de sessão.
9. Somente depois apontar/publicar o frontend para a URL homologada da API.

## Limitações do plano Free

O serviço gratuito do Render é adequado para desenvolvimento e homologação, não para declarar produção crítica. Ele pode entrar em suspensão após período sem tráfego e apresentar cold start ao receber a próxima requisição. O filesystem do serviço também é efêmero — por isso esta edição usa PostgreSQL Supabase e Storage privado, não arquivos locais, para persistência.

## Critério de conclusão

A existência do Blueprint não significa homologação. A frase de status continua sendo:

> **PROJETO SUPABASE REAL CRIADO, SCHEMA/HARDENING APLICADOS E RUNTIME DE MENOR PRIVILÉGIO PREPARADO — PENDENTE CONEXÃO PRIVADA DA API E HOMOLOGAÇÃO E2E.**

Somente após o deploy manual e os gates reais de banco, storage, autenticação e E2E deve-se declarar a edição Supabase homologada.
