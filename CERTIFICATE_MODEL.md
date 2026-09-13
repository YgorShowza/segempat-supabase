# Certificado Oficial SEGEMPAT

## Finalidade

O certificado é um documento de capacitação interna emitido exclusivamente para avaliação aprovada, com assinatura eletrônica registrada, código de validação e registro formal vigente no SEGEMPAT.

Uma tentativa não aprovada não deve gerar documento denominado **CERTIFICADO**.

## Estrutura do documento

### Página 1 — Certificado

- Empresa Alagoana de Terminais;
- Unidade de Segurança Portuária;
- nome do profissional, matrícula e setor;
- atividade de capacitação;
- modalidade e data de conclusão;
- situação **APROVADO**;
- critério mínimo de aprovação;
- unidade emissora;
- código de autenticidade eletrônica.

A nota individual não é o elemento de destaque da primeira página.

### Página 2 — Anexo técnico

- identificação do certificado;
- conteúdo programático/ementa cadastrado na descrição da atividade;
- modalidade;
- resultado final e critério mínimo;
- situação;
- data de conclusão;
- registro da assinatura eletrônica do avaliado;
- mesmo código único da página 1.

O anexo do certificado **não reproduz banco de questões, gabarito ou respostas individuais**. Esses dados permanecem evidência administrativa separada e sujeita às regras de acesso do SEGEMPAT.

## Fonte do conteúdo programático

No modelo atual, o campo `description` da prova/atividade é a fonte do conteúdo programático exibido no anexo. Caso o campo esteja vazio, o documento informa a ausência do conteúdo cadastrado e não inventa ementa, carga horária, questões ou respostas.

## Validação

A validade documental depende cumulativamente de:

1. tentativa aprovada;
2. código de certificado emitido pelo servidor;
3. assinatura eletrônica registrada;
4. registro formal correspondente em `certificates`;
5. certificado não revogado.

A página administrativa `/validar-certificados` é a fonte interna para consulta da situação do código. O documento não cria endpoint público de validação nem envia o código a serviços externos de QR Code.

## Impressão/PDF e integridade visual

A emissão utiliza **duas páginas A4 em orientação retrato**. A visualização administrativa e a impressão usam o mesmo gerador de documento para impedir divergência entre a prévia e o PDF.

Antes de liberar a impressão, o navegador deve:

1. carregar a identidade visual obrigatória;
2. aguardar as fontes utilizadas pelo documento;
3. montar as duas páginas em geometria A4;
4. verificar se o conteúdo permanece dentro da área segura, sem invadir o rodapé ou as margens institucionais.

Se qualquer página exceder a área segura, a impressão deve ser **bloqueada** em vez de produzir um certificado cortado, desalinhado ou com informação oculta. Títulos, nomes e conteúdos programáticos extensos recebem ajustes tipográficos controlados, mas não podem ser truncados silenciosamente.

As cores institucionais devem ser preservadas na impressão por meio das propriedades de ajuste de cor suportadas pelo navegador. O usuário continua podendo imprimir ou salvar como PDF pelo diálogo nativo do navegador somente depois que a prévia for considerada apta para A4.
