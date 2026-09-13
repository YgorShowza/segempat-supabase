# SEGEMPAT CI Contracts

Os arquivos YAML deste diretório preservam os contratos de validação que antes eram workflows independentes do GitHub Actions.

Eles **não são executados diretamente pelo GitHub Actions**. O workflow `.github/workflows/contracts.yml` faz um único checkout e um único setup de Node.js e então `scripts/run-contract-workflows.mjs` executa, em sequência, todos os passos `run` destes contratos.

O objetivo é manter as mesmas validações funcionais, de segurança, governança e interface com muito menos consumo de minutos de runners hospedados.

A suíte consolidada aceita apenas ações auxiliares `actions/checkout@v4` e `actions/setup-node@v4` nos contratos. Se um novo contrato precisar de serviços, secrets, dependências especiais, outro sistema operacional ou uma action diferente, ele deve permanecer como workflow separado em `.github/workflows`.
