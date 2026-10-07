# Verificação da entrega v17

Validação em 7 de outubro de 2026, com Node.js 22 e o projeto atualizado a partir do ZIP v16.

| Verificação | Resultado |
| --- | --- |
| `npm test` | **172 testes aprovados**, zero falhas. Regras, geometria, catálogo, migrações, PostgreSQL/PGlite, permissões e operações transacionais. |
| `npm run typecheck` | Aprovado. |
| `npm run build` | Aprovado, com compilação de produção e geração das rotas. |
| Navegador sobre o build de produção | **25 fluxos distintos**. Rodada de 24/24 e, após os últimos ajustes, rodada de 12/12, com 11 repetições e um novo caso de magia com duas origens. |
| Migração da v16 para a v17 | A 018 é executada duas vezes nas verificações, preservando registros e aceitando repetição. |
| Projeto empacotado sem SQL histórico separado | **172/172 testes aprovados** usando as fontes arquivadas; o gerador reproduz exatamente o SQL 018 validado. |
| Fontes anteriores | As 17 migrações anteriores continuam idênticas, byte a byte, ao ZIP v16. O pacote de atualização inclui apenas a 018 como SQL executável. |

## Magias, habilidades e itens

- Concordância entre cliente e PostgreSQL em 165 combinações de classe/magia, além de caminhos, níveis, Segredos Mágicos, Tomo e lista expandida do Ínfero.
- Classes sem conjuração e marcação genérica de “extra” não liberam magias. Limites de truques/conhecidas e concessões especiais são verificados no salvamento.
- A mesma magia pode ser salva por duas origens de multiclasse; repetir a escolha na mesma origem é rejeitado.
- Fórmulas, tipo de efeito, revisão e bônus das 37 armas são comparados entre cliente e servidor em duas construções de personagem.
- Proficiência da classe inicial/multiclasse, ajustes de treino e bônus de ataque; arma versátil, duas armas e rede sem dano, exigindo alvo e ação inteira.
- Fúria, Retomar o Fôlego, Surto de Ação, Ataque Furtivo, Destruição Divina, Ki, Imposição das Mãos, cura do Domínio da Vida e dano físico/radiante com tratamento separado.
- Poções sem atributo de conjuração, munição compatível, dez usos do kit, esgotamento, quantidades preservadas e item com zero unidades sem impedir edição da ficha.
- Dono/controlador, mestre, terceiros, turnos, tentativas repetidas, gastos únicos e operações idempotentes.

## Navegador e regressão

Seleção de magias por classe/caminho; salvamento de duas origens; inventário agrupado e campos de arma no celular; Compêndio; prévia 3D e cone/área em 2D; envio e aprovação; falha sem dano; dados após sucesso; cura com espaço superior; uso de poção e habilidade por nível de classe.

Também foram verificados criação assistida e antecedentes, arquivo/cópia de sessões, imagem do mapa, edição de NPC, dados públicos/privados, tela cheia, cache do terreno, bloqueio da edição durante combate, seleção em água e privacidade/revelação de áreas ocultas. Capturas da v17 estão em `magia-area-v17-3d.png`, `inventario-v17-mobile.png`, `compendio-itens-v17.png` e `pocao-resultado-v17.png`.

## Ambiente e limites

Os testes de navegador usam uma API local controlada. Os testes de banco executam as migrações em PostgreSQL via PGlite, com papéis de mestre, jogador e terceiro, Auth/Storage simulados e RLS. O build foi validado com variáveis públicas de teste local. Esta entrega não foi publicada no domínio nem aplicada ao Supabase real da campanha.

Habilidades condicionais e efeitos manuais estão identificados no Compêndio e no [guia da v17](magias-combate-e-itens-v17.md). Os testes não constituem execução automática de todas as habilidades de suplementos ou todos os casos possíveis de D&D.

Registros: `testes-banco-e-logica-v17.txt`, `typecheck-v17.txt`, `build-producao-v17.txt`, `testes-navegador-producao-v17.txt` e `testes-navegador-ajustes-v17.txt`.

A reprodução pelo pacote entregue, sem os arquivos SQL históricos separados, é registrada em `testes-fontes-empacotadas-v17.txt`. O gerador deve reproduzir a mesma 018 usando `supabase/development-sources.json`; esse arquivo de dados não é executado no banco da campanha.
