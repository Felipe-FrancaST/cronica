# Crônica — melhoria da ficha de NPCs (mestre)

## O que mudou

- A ficha foi reorganizada em cinco etapas: **Essencial**, **Combate**, **Equipamentos**, **Ações e magias** e **História**.
- Campos técnicos menos frequentes (tipos de criatura, treinamento, perícias, salvaguardas, sentidos e conjuração) ficam em seções opcionais expansíveis, sem perder seus valores antigos.
- Interface renovada para o mestre, com identificação, resumo de PV/CA/itens, seleção de retrato, controle de visibilidade e layout responsivo.
- Nova aba **Equipamentos**, com pesquisa no catálogo D&D 5e, filtros por categoria, adição rápida, itens personalizados, quantidades, peso, descrições e equipar/desequipar.
- Armas podem gerar ataques editáveis na ficha. Armadura e escudo equipados podem sugerir a CA; o mestre escolhe se aplica a sugestão.
- Os equipamentos podem ser editados e vistos ao reabrir o NPC, inclusive quando a ficha é aberta a partir da mesa tática.
- Textos de inventário preexistentes não são apagados; agora aparecem em **Objetos narrativos e anotações livres**.

## Compatibilidade com Supabase

Não é necessária atualização SQL. Os equipamentos são persistidos como dados estruturados versionados dentro do campo `npc_stats.inventory` que já existia no banco. A camada `src/lib/npc-equipment.ts` faz a codificação/decodificação; versões antigas do inventário continuam como texto legível. Para NPCs sem itens estruturados, o conteúdo original do campo permanece inalterado.

## Instalação

Use o ZIP de projeto completo para substituir o código-fonte ou copie somente os arquivos do ZIP de alterações para os respectivos caminhos na versão atual. Como de costume, instale as dependências usando `npm ci` antes de executar o projeto. Não é preciso executar novas migrações para esta mudança.

## Verificações

- Checagens locais de persistência, preservação de anotações legadas e cálculo de CA sugerida passaram.
- Verificação estática das mudanças em TypeScript não apresentou erros relacionados aos arquivos alterados.
- Testes de interface foram atualizados para os novos rótulos, e foi adicionado um cenário de criação/equipamento/reabertura de NPC.
- O teste completo do projeto não pôde ser executado neste ambiente porque o ZIP de origem continha dependências para Windows, com pacotes de execução ausentes/incompatíveis no Linux. Rode `npm ci`, `npm run typecheck` e os testes no seu ambiente para validação final.
