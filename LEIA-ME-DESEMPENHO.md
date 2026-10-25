# Desempenho e fluidez

Este guia documenta a revisão de desempenho anterior. Para instalar os novos controles de visão da atualização 044, siga também `LEIA-ME-VISAO-DOS-JOGADORES.md`.

Esta atualização altera o código do site. Não acrescenta migrações SQL nem variáveis de ambiente. Substitua os arquivos do projeto e publique novamente. As migrações anteriores continuam sendo pré-requisitos; quem já instalou a versão de NPCs, condições e visão não precisa executar SQL novamente para esta revisão.

## O que mudou

- Atualizações de dados preservam as referências das campanhas, perfis e fichas que não mudaram. Isso evita reconstruir formulários, índices de movimento e o mapa em consultas sem alterações. Registros removidos ou ocultados pelas permissões continuam sendo removidos da tela.
- O cálculo da visão usa um índice de obstruções para dispensar a varredura de raios em áreas livres. Quando existe uma possível obstrução, mantém o cálculo exato das paredes e cantos. Iluminação, penumbra, escuridão mágica e sentidos especiais continuam sendo considerados.
- Uma atualização de ação ou de PV que não modifica a visão reutiliza o resultado e a máscara existentes. Movimentos, mudanças de luz, paredes, neblina, sentidos ou condições visuais invalidam esse resultado. A invisibilidade é atualizada separadamente.
- O desenho 2D aproveita a iluminação individual já calculada, sem procurar novamente cada fonte de luz para cada célula. A prévia de área de ataque ou magia também é reutilizada quando seus dados não mudam.
- Pedidos simultâneos da mesma imagem compartilham uma consulta. Os endereços privados ficam em memória por no máximo dez minutos, com limite de entradas e limpeza ao trocar de usuário. Falhas permitem nova tentativa. Respostas da sessão anterior são descartadas.
- O grid 2D libera imagens antigas depois da renovação de seus endereços ou da troca dos retratos e mapas. Isso evita acumular imagens decodificadas durante sessões longas.

## Medições locais

Comparação com o pacote anterior, no mesmo ambiente, usando dois observadores e a mediana de sete execuções do cálculo de visão:

| Cenário | Antes | Depois |
| --- | ---: | ---: |
| Mapa aberto, 250 × 200 células | 84,01 ms | 4,21 ms |
| Mapa com paredes, 160 × 120 células | 16,70 ms | 9,02 ms |
| Mapa noturno com paredes e 48 luzes, 160 × 120 células | 12,46 ms | 6,14 ms |

No navegador, uma atualização sem alterações passou de duas repinturas do grid 2D para nenhuma. O teste também confirma que uma alteração real de PV aparece após a atualização seguinte. Em um teste isolado do serviço de imagens, vinte consumidores simultâneos compartilharam uma única consulta, sem reaproveitar respostas de outro usuário.

Essas medições cobrem os cenários indicados; não representam FPS nem latência da hospedagem. A resposta na campanha publicada ainda depende do dispositivo, da rede e do tempo de processamento do servidor.

## Verificação

Nesta revisão, passaram 556 testes automatizados de regras, banco de dados e utilitários, 33 testes de interface, a compilação de produção e a verificação de formatação.

O pacote contém testes para atualização das fichas, remoção de registros, troca de usuário, cache de imagens, invalidadores de visão e equivalência dos raios em mapas vazios, esparsos e densos. O benchmark pode ser repetido com `npm run benchmark:vision`. Os testes específicos de interface usam `npm run test:runtime-performance` com o servidor de dados local de testes.

Para aparelhos com pouca capacidade gráfica, a opção **Qualidade do 3D → Leve** continua disponível nas preferências. O modo 2D também permanece disponível, mantendo as regras de combate e visão.
