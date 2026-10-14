# Novo painel do mestre

O painel abre uma ferramenta por vez. Na preparação, começa na aba **Cenário**; durante um combate, começa em **Combate**, com as tentativas dos jogadores. **Dados** continua disponível ao lado. O estado do combate e as permissões de edição continuam valendo.

## Onde encontrar cada controle

| Ferramenta em Cenário | Para que serve                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Objetos**           | Colocar elementos, personalizar peças e encontrar as que já estão no mapa.                                                      |
| **Interações**        | Acender/apagar luzes, abrir/fechar passagens, controlar fechaduras e configurar recipientes. Também funciona durante o combate. |
| **Terreno**           | Escolher pincéis, pintar terreno normal/difícil, bloquear caminhos e apagar objetos.                                            |
| **Luz e visão**       | Alterar dia/noite, visão por personagem, escuridão geral/regional e áreas ocultas.                                              |
| **Participantes**     | Adicionar personagens/NPCs e mudar aliança, controle ou visibilidade das peças.                                                 |
| **Regras da mesa**    | Ajustar as regras do turno e permitir movimento acima do limite, ainda respeitando obstáculos.                                  |

Clique no cartão de uma ferramenta para abrir. Use a seta **Ferramentas** para voltar ao menu ou pressione **Escape**. Ao voltar ou trocar de painel, pincéis e marcações em andamento são interrompidos. Os valores preenchidos nos ajustes ficam preservados enquanto você alterna ferramentas no mesmo mapa.

As listas usam busca e paginação. O painel acompanha a rolagem normal da página, sem barras de rolagem dentro de outras listas. O menu se adapta a desktop, tablet e celular.

## Colocar e editar objetos

1. Ative **Editar grid** e abra **Objetos**.
2. Em **Biblioteca**, busque uma peça, filtre a categoria ou use os favoritos. Clique no elemento e depois no Grid para colocá-lo.
3. Para personalizar antes de colocar, abra **Ajustes**. Nome e variante ficam à mão; aparência, tamanho, iluminação e bloqueios abrem por clique. Só um desses grupos fica aberto por vez.
4. Em **No mapa**, busque uma peça colocada e selecione-a para editar. Você também pode tocar diretamente no objeto do Grid: os ajustes aparecem e as opções de **Mover/Excluir** ficam junto ao mapa.
5. Para encerrar uma pintura sem abrir o painel, use **Parar ferramenta** acima do Grid. **Concluir edição** termina a edição do cenário.

Baús e recipientes continuam abrindo a configuração de conteúdo e chave ao serem colocados. O conteúdo, as chaves e a coleta única continuam com a validação do servidor. Fora da edição, tocar em uma peça oferece sua interação.

## Câmera e mapa

**2D/3D**, zoom, ajuste e tela cheia continuam junto ao mapa. Clique em **Câmera** para abrir navegação, rotação, vistas superior/isométrica, qualidade do 3D e foco da peça. Escape recolhe esses controles.

O indicador **Dia/Noite** permanece visível. Para alterá-lo, abra **Luz e visão**. A visão por personagem e a escuridão ficam na mesma ferramenta; os controles para marcar regiões abrem em **Escuridão em regiões**.

O botão **Mapa**, no cabeçalho do painel do mestre, abre a configuração já existente: dimensões, escala, grade e imagem. Durante o combate, os bloqueios de edição continuam sendo explicados pelos controles.

## Atualizar e verificar

Esta revisão é de código. Se já aplicou a migração **027**, não há SQL novo. Substitua os arquivos, preserve seu `.env.local`, execute o build e publique pelo processo habitual. Depois recarregue as abas dos participantes.

```bash
npm run typecheck
npm test
npm run format:check
npm run build
```

Com o Chromium do Playwright instalado:

```bash
npm run test:master-panel
npm run test:scenery
npm run test:performance
```

Esses testes de navegador usam uma API local isolada e não modificam seu Supabase. As melhorias de desempenho, a confirmação por elemento e a recuperação após falhas continuam incluídas.

Nesta revisão passaram **295 testes de lógica e banco local**, **25 fluxos de navegador**, a conferência de tipos, a formatação e o build de produção. O layout foi conferido em 1440, 1024 e 390 pixels de largura.
