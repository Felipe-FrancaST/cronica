# Atualização 041 — criação, ficha e ações de personagens

## Instalação

1. Faça um backup do banco e mantenha uma cópia do código publicado.
2. Com as migrações até 040 já aplicadas, execute **somente** `supabase/migrations/202610240041_character_actions.sql` no SQL Editor do Supabase. A migração é transacional e pode ser reaplicada.
3. Publique esta versão do código. Não é necessário alterar as variáveis de ambiente.

Não execute `schema.sql` sobre o banco existente. Ele é a instalação consolidada para ambientes novos. As migrações 001–040 foram preservadas.

## Criação e organização da ficha

- O retrato abre o seletor de imagem e o recorte ao ser tocado. O campo de nome ocupa o cabeçalho.
- A criação não mostra experiência nem nome do jogador. A experiência continua disponível nas fichas existentes.
- As características raciais mostram tamanho, deslocamento e visão; traços e referências podem ser expandidos.
- As referências de livros ficam recolhidas. A explicação de classes e proficiências abre pelo ícone de informação.
- O equipamento inicial possui um botão principal destacado.
- Os idiomas adicionais do antecedente entram no campo Idiomas. Ao desmarcar uma escolha, somente aquele idioma de antecedente é retirado; os demais são preservados.
- Equipar/desequipar funciona pelo ícone na linha do item. As magias começam recolhidas e possuem um ícone de preparação que respeita a classe e o limite de magias preparadas. Truques e magias sempre preparadas são identificados automaticamente.
- Avisos, erros e confirmações aparecem no centro da janela, inclusive na ficha rolada e na mesa em tela cheia. Erros permanecem até serem fechados.

## Multiclasse

O total de níveis respeita as regras da campanha e o limite 20. Com nível fixado, adicionar uma classe redistribui os níveis existentes. Ao aumentar uma classe, outras podem ceder níveis, mantendo pelo menos um por classe. Os requisitos são verificados com os atributos finais, inclusive após perder uma melhoria de atributo. As proficiências da classe inicial e os dados de vida já gastos são preservados. A validação existente do servidor continua sendo aplicada ao salvar.

## Descansos pela lista de personagens

O botão **Descansar** permite escolher descanso curto ou longo sem abrir a ficha. O mestre escolhe em **Regras → Jogadores podem executar descansos** se o jogador pode executar o próprio descanso. O mestre mantém acesso aos personagens da campanha.

- Descanso curto: escolha quantos dados de vida disponíveis deseja gastar por classe. O servidor rola os dados, aplica Constituição, limita a cura aos PV máximos e recupera os recursos de descanso curto, incluindo os espaços de pacto.
- Descanso longo: recupera PV, espaços e recursos de descanso longo, além de até metade dos dados de vida totais, com mínimo de um, conforme a base D&D 5e de 2014. Se nenhuma recuperação por classe for escolhida, usa a ordem das classes da ficha.
- É necessário confirmar que o tempo passou na história e que o descanso foi concluído. Não há um cronômetro de tempo real.
- O servidor bloqueia descansos durante combate ativo ou para personagens inconscientes/com 0 PV. Cliques repetidos e tentativas de repetir uma mesma solicitação não executam a ação novamente.
- Os botões de recuperação de recursos que já existem dentro da ficha continuam limitados pela permissão de descanso; eles servem para registrar recursos, enquanto o novo diálogo executa o descanso completo.

## Inspirações

O contador fica na lista e na ficha. Apenas o mestre concede inspirações; o dono do personagem pode consumir as suas. O mestre também pode remover pontos. O limite operacional é de 99. Este contador acumulável atende à regra solicitada para a mesa e é separado da Inspiração de Bardo.

Uma inspiração antiga marcada vira 1 ponto. Salvar uma ficha antiga aberta não sobrescreve o contador, e alterações manuais do contador em um salvamento comum são ignoradas pelo servidor. O controle de acesso está no banco, não apenas nos botões.

## Validação local

- `npm test`: testes de regras e banco local, incluindo a cadeia de migrações e permissões das novas ações.
- `npm run typecheck` e `npm run build`.
- `npm run test:sheet-usability`: criação, avisos, multiclasse, inspiração, descanso e ícones rápidos em navegador local.
- `npm run test:creation-media` e `npm run test:character-pdf`: recorte, criação assistida, idiomas e exportação.

Os testes usam dados locais e não alteram o Supabase de produção. O registro gerado de recursos de descanso curto pode ser atualizado por `node --import tsx scripts/generate-character-actions.ts`; isso é manutenção do código, não uma etapa da instalação.
