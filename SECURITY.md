# Segurança do SEGEMPAT

O SEGEMPAT é uma aplicação corporativa de gestão operacional. Este repositório contém código-fonte, migrations e documentação técnica, mas **não deve conter credenciais reais, chaves privadas, certificados privados, dados corporativos reais ou dumps do banco**.

## Arquitetura de segurança

```text
Navegador / Cloudflare
        | HTTPS
        v
API SEGEMPAT — Node.js / Express
        | TLS
        v
MySQL 8 corporativo
```

O frontend nunca acessa o MySQL diretamente. Credenciais do banco, segredo de sessão e material TLS privado pertencem exclusivamente ao ambiente da API/secret manager da empresa e nunca devem ser colocados em variáveis `VITE_*`.

A aplicação implementa, entre outros controles:

- autenticação por sessão assinada e cookie HTTP-only;
- `Secure=true` obrigatório em produção;
- autorização granular `master`, `admin`, `inspector` e `operator` aplicada no backend;
- menor privilégio e redaction de leituras administrativas sensíveis;
- proteção do último Administrador Master utilizável;
- recuperação de senha com hierarquia de autoridade, código temporário em hash, expiração e limite de tentativas;
- invalidação de sessões após mudanças relevantes de credencial/privilégio;
- CORS/origem explícita para operações de escrita;
- TLS obrigatório para MySQL em produção;
- usuário MySQL de runtime separado da credencial de migration;
- trilha de auditoria para ações privilegiadas;
- bloqueio de indexação pública da aplicação (`noindex`/`Disallow: /`).

Detalhes e limitações estão registrados em `SECURITY_AUDIT.md`, `LGPD_GOVERNANCE.md`, `ENTREGA_TI.md` e nos checklists de homologação.

## Relato de vulnerabilidade

Não publique em Issues, Pull Requests, Discussions ou comentários:

- senhas, tokens ou cookies;
- host/IP interno, credenciais ou strings de conexão reais;
- chaves privadas ou certificados privados;
- dados pessoais ou registros operacionais reais;
- detalhes de uma vulnerabilidade ainda explorável no ambiente corporativo.

Vulnerabilidades devem ser comunicadas pelo **canal de segurança definido pela TI da empresa** ao responsável técnico autorizado. O canal corporativo deve ser definido antes da implantação; este repositório não publica endereço pessoal ou segredo operacional para esse fim.

Ao relatar, inclua apenas o necessário para reprodução segura: versão/commit, componente afetado, impacto, passos mínimos e evidências sanitizadas.

## Antes de tornar o repositório público

Execute a partir de um clone completo:

```bash
npm run audit:public
```

O gate verifica arquivos versionados atuais e nomes/padrões sensíveis presentes no histórico Git. Um clone raso (`shallow`) é rejeitado para que a auditoria de histórico não produza falsa sensação de segurança.

A publicação do código **não equivale à homologação corporativa** e não autoriza exposição de configurações reais. O status permanece:

**PARTE DO MYSQL NO CÓDIGO CONCLUÍDA — PRONTO PARA CONECTAR AO BANCO DA EMPRESA.**
