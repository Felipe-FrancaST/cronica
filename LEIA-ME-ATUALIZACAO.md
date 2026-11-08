# Atualização 051 — Salvamento e fluidez

## Atualizar a partir da 050

1. Preserve suas variáveis de ambiente.
2. Substitua o código pela pasta `cronica` deste ZIP.
3. Execute `npm ci`, `npm run typecheck` e `npm run build`, usando Node.js 22 ou superior.
4. Publique pelo processo habitual e recarregue as abas abertas.

**Não existe migração 051: esta atualização não altera o banco.** Se já aplicou a migração 050, não execute SQL novamente. Se ainda estiver em uma versão anterior, conclua as migrações pendentes até a 050, na ordem. O `supabase/schema.sql` permanece exclusivo para instalações novas.

## Correções

- Trocar entre Identidade, Essência, Aptidões e as demais seções deixa de forçar a janela ao topo. A aparência dos atalhos foi preservada. As setas do teclado, Home e End também navegam entre eles.
- Após confirmar a gravação, a ficha atualiza a lista local. A recarga dos demais dados continua sem prender o botão indefinidamente; a espera por essa recarga é limitada a 1,5 segundo.
- Uma gravação sem resposta libera o formulário após 30 segundos, apresenta um aviso e preserva o rascunho. Requisições HTTP do cliente também têm limite de espera. O envio de retrato recebe tratamento próprio de demora.
- A confirmação usa a versão retornada pelo banco. Não há repetição automática da gravação da ficha. Em caso de resposta perdida, reabra a ficha para verificar o que foi salvo antes de tentar novamente.
- O botão indica quando está salvando e evita envios simultâneos.
- Os rascunhos são gravados após 500 ms sem edição, ao sair/ocultar a página e imediatamente antes do salvamento da ficha de Arkanis. Isso evita gravações síncronas a cada tecla.
- As melhorias compartilhadas de espera e rascunhos também beneficiam outros formulários que usam esses componentes.

Os dados da ficha são preservados no rascunho quando o navegador permite armazenamento local. O arquivo de retrato selecionado permanece disponível enquanto o editor está aberto; arquivos de imagem não são incluídos no rascunho recuperável após fechar a página.

A gravação da ficha e o envio do retrato são etapas separadas. Se a imagem falhar depois da gravação dos dados, o aviso permite tentar novamente sem anunciar que o retrato foi salvo.

Consulte `VALIDACAO-051.md` e `ALTERACOES-051.md`. As funcionalidades das versões 049 e 050 foram mantidas.
