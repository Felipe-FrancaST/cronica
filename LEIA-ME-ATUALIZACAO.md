# Atualização 020: elementos e cidade medieval

Esta atualização se concentra nos elementos do Grid. Mantém as melhorias anteriores, todos os SQLs existentes, o lockfile e as configurações Supabase/Vercel.

## Atualizar a instalação existente

1. Substitua o código pela pasta `cronicarpg` deste ZIP, preservando seu `.env.local`.
2. Se já aplicou a atualização 019, execute **somente** `supabase/migrations/202610070020_large_scenery_and_medieval_city.sql` no SQL Editor do seu Supabase. Se ainda está na 018, aplique a 019 e depois a 020, nessa ordem.
3. Execute `npm ci` e `npm run build` e publique pelo processo habitual da Vercel.
4. Recarregue as abas dos participantes.

Não execute `schema.sql` novamente. A migração 020 não apaga dados nem redimensiona os elementos existentes. Ela amplia a validação dos objetos, permite salvar a altura visual e adiciona a criação atômica de cenários. As regras e a autenticação existentes são mantidas.

## Elementos

- Limite ampliado de 8 × 8 para **128 × 128 células**, dentro das bordas do mapa.
- Os 46 tipos têm dimensões padrão, com ajustes próprios para variantes como navio, solar, torre, pavilhão e montanha nevada. Os padrões consideram **1,5 m por célula**.
- Largura e comprimento no grid continuam editáveis. **Altura visual (metros)** permite ajustar a dimensão vertical; vazia usa a proporção automática. **Restaurar tamanho padrão** recupera as dimensões da variante.
- Prévia com proporções reais e medidas em metros; variantes novas escolhem seus tamanhos padrão. Alterar uma variante de uma peça já selecionada preserva sua área ocupada.
- Copas, pedras, montanhas, vegetação, perigos, construções e mobiliário receberam detalhes em 2D/3D. As montanhas usam relevo irregular e neve por altitude. Plantações usam fileiras; superfícies repetem texturas; construções têm telhas, beirais, janelas, ferragens e acabamentos.
- Instâncias e geometrias agrupadas por material reduzem o trabalho de desenho. Prévia de peças grandes usa contorno para evitar milhares de células de destaque a cada movimento do mouse.

## Criar Valedouro

Abra **Mesa → Grid → Novo mapa**. Em **Cenário inicial**, escolha **Valedouro · cidade medieval pronta** e clique em **Criar cidade**.

O cenário tem **128 × 112 células**, equivalentes a **192 × 168 metros**, e **175 elementos editáveis**. Inclui praça com fonte e mercado, moradias orientadas para as ruas, tavernas, estalagem, solar, ferrarias, estábulo, muralhas com quatro portões, rio e ponte, hortas, lavouras e pomar. A criação é uma única operação: uma falha desfaz a criação inteira e uma repetição da mesma solicitação reutiliza o mapa concluído.

Para editar, encerre o combate da mesa e habilite **Editar grid**. Selecione a peça no mapa ou na lista para mover, redimensionar, mudar a variante, o estilo, a cor ou a altura. A cidade é criada como um mapa novo; os mapas anteriores são preservados. Durante a preparação da sessão, o cenário segue a visibilidade já definida para o mestre.

Veja [o guia dos tamanhos e da cidade](docs/elementos-e-cidade-v20.md). As instruções da atualização anterior continuam em [regras-e-cenarios-v19.md](docs/regras-e-cenarios-v19.md).

Não inclua `node_modules`, `.next`, `.env.local`, caches, logs e relatórios no deploy. Os arquivos de ignore mantêm esses materiais fora da Vercel.
