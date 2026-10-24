# Correções da ficha e da oficina de mapas

## Instalação

Substitua o código pela versão deste pacote e publique novamente. Esta correção **não exige SQL novo**. Se você ainda não instalou a atualização anterior de descansos e inspirações, siga antes o guia `LEIA-ME-FICHAS-E-ACOES.md` e aplique a migração 041 após a 040.

## Ficha

- Fechar um aviso pelo X fecha somente o aviso e preserva o diálogo e todas as escolhas da ficha. Cliques nos avisos sobrepostos deixam de ser interpretados como cliques fora do editor.
- Os campos Nível e níveis de cada classe aceitam ficar vazios durante a digitação. Valores válidos entre 1 e 20 atualizam a ficha; ao sair de um campo vazio, o último nível válido é restaurado. Valores fora dos limites são ajustados ao sair. As regras de nível fixado e multiclasse continuam valendo.
- As magias recolhidas mantêm cabeçalhos compactos, com ícones de preparação e exclusão. O conteúdo expandido usa uma área própria, sem esticar a linha ou criar rolagem horizontal no celular.

## Oficina de mapas

- A borracha mostra controles de tamanho e formato, ocultando a paleta e os controles de cor e relevo que pertencem à pintura.
- O tamanho do símbolo aparece no alto da biblioteca e permanece acessível durante a rolagem. O tamanho de um símbolo ou token selecionado também fica acima das demais propriedades.
- O botão Selecionar, incluindo o atalho V, abre o painel Seleção. O próprio painel Seleção ativa a ferramenta para escolher e mover os elementos.
- Rotas possuem o botão Ocultar pontos / Mostrar pontos. Ocultar as bolinhas não altera a rota salva; a edição individual de vértices fica suspensa enquanto estiverem ocultas. O traçado permanece visível e pode continuar sendo selecionado e movido.
- Exportar PNG ou backup editável mostra uma confirmação central em tela normal e cheia. A confirmação indica que o arquivo foi gerado e enviado ao navegador; a escolha de pasta e a gravação no computador continuam sob controle do navegador.
- Falhas na geração do PNG mostram erro, sem mensagem de sucesso. Fechar o aviso mantém a exportação aberta para tentar novamente.

## Verificação

`npm run test:editor-corrections` cobre os regressos de fechamento de avisos, edição de níveis, magias no celular, borracha, tamanho de símbolos, seleção, pontos das rotas e exportação nos dois modos de tela, incluindo tentativas que falham.

As suítes existentes de ficha e oficina de mapas continuam disponíveis. Os testes de navegador usam o servidor local de testes e não acessam o Supabase de produção.
