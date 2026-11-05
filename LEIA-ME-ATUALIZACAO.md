# Atualização 048 — Arkanis e ingredientes

Esta entrega acrescenta **Arkanis** ao Crônica e conserva D&D 5e e as correções da atualização 047. A ficha de Arkanis tem dados e organização próprios. As campanhas existentes mantêm seu sistema; não há conversão automática de fichas.

## Atualizar

1. Faça uma cópia do projeto e um backup do banco.
2. Substitua o código pela pasta `cronica` do ZIP, preservando as variáveis de ambiente e a configuração da sua hospedagem.
3. Se o banco já está na **047**, aplique **somente** `supabase/migrations/202611040048_arkanis_sheets_and_ingredients.sql` no SQL Editor do Supabase.
4. Se está na **046**, aplique a **047 e depois a 048**. Para versões anteriores, aplique apenas as migrações ausentes, na ordem dos nomes. As migrações 001–047 não foram modificadas.
5. Na pasta do projeto, usando Node.js 22 ou superior, execute:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

6. Publique pelo seu processo habitual e recarregue as abas de todos os participantes.

Aplique o SQL antes de publicar o código. A aplicação não executa migrações automaticamente. Para um banco existente, não execute `supabase/schema.sql`.

## Banco novo

Configure as variáveis a partir de `.env.example` e siga os guias de Auth, Storage, URLs e pagamentos já incluídos. Em um banco vazio, aplique as **48 migrações em ordem** ou use `supabase/schema.sql`, que contém a sequência completa. Escolha um dos dois caminhos.

## Usar Arkanis

1. Crie uma campanha e escolha **Arkanis** em Sistema de RPG.
2. Em Personagens, crie uma ficha. O dossiê inclui Identidade, Corpo/Mente/Espírito, Aptidões, Arsenal/Técnicas, Grimório, Bolsa e Alquimia.
3. Preencha o nome, os HP máximos acordados com o mestre e os três dados de Arkano. Ajuste os recursos atuais e salve.
4. Em **Alquimia → Catálogo completo**, pesquise entre os 180 ingredientes, filtre por habitat, informe a quantidade que o personagem possui e adicione à bolsa. A adição é confirmada ao salvar a ficha.
5. Em **Bolsa**, um objeto personalizado pode receber a tag **ingredientes**. Apenas objetos com essa tag e quantidade maior que zero aparecem em Meus ingredientes.
6. O mestre também pode usar **Itens → Criar item** para cadastrar um ingrediente do catálogo e entregá-lo a um personagem, usando o fluxo de entrega existente. Quantidades e origem dos itens entregues continuam protegidas pelas permissões.

A demonstração local também oferece Arkanis ao criar campanhas, inclusive para dados de demonstração já existentes. A demonstração continua desativada em produção por padrão.

## Esta primeira etapa

O catálogo contém os nomes e as afinidades fornecidos pelo usuário, em **18 habitats**, com **180 arquivos SVG locais**, sem dependência de imagens externas. Os ícones são vetores originais, organizados por material e habitat. A tag é persistida no inventário; as quantidades pertencem a cada personagem.

**As receitas, combinações, testes, resultados, custos e consumo para criar poções serão a próxima implementação.** Nesta versão, consultar a bancada não produz poções nem consome ingredientes. As afinidades são referências narrativas, não efeitos mecânicos já balanceados.

O grimório e as técnicas permitem registrar aprendizado, requisitos e efeitos. O mestre confirma os aprendizados e resolve as ações de Arkanis. A automação de combate e os descansos de D&D não são aplicados às fichas de Arkanis. A oficina de mapas, as sessões e o mural continuam disponíveis; o atalho Grid de uma campanha de Arkanis orienta a resolução manual e o acesso a mapas e fichas.

## Decisões do livro preservadas

Veja `docs/arkanis-048.md` para o mapeamento dos campos e das páginas. O livro tem pontos que precisam de decisão da mesa:

- **HP:** informa os dados raciais, mas não apresenta uma fórmula completa de geração e progressão. O máximo é informado com o mestre.
- **Arkano 75:** aparece em duas faixas. Há um campo para registrar o modificador escolhido.
- **Maestria 3:** a tabela indica três dados e o exemplo usa quatro. A ficha pede essa escolha ao registrar a arma nesse nível.
- **Durabilidade:** a descrição e o exemplo descontam valores diferentes. HP e DUR são acompanhados manualmente.
- **Mana:** a sugestão usa `(nível × 5 + INT final) × ModARK`, mantendo o valor base quando ModARK é zero. A mesa pode definir um máximo manual.

## Conferir o banco

```sql
select slug, name, active from public.rpg_systems
where slug in ('dnd5e','arkanis');

select count(*) as ingredientes from public.arkanis_ingredients;

select to_regprocedure('public.save_arkanis_character(jsonb,timestamptz)')
 is not null as fichas_arkanis_048;
```

O catálogo deve conter **180** ingredientes e o último resultado deve ser `true`. Faça uma criação de teste em uma campanha nova e confira a ficha após recarregar.

## Manutenção e automações

O processamento e a limpeza de mídia da 047 permanecem disponíveis. O `vercel.json` padrão mantém cron diário. Para manutenção a cada cinco minutos, configure o workflow `.github/workflows/maintenance.yml` com os secrets `CRONICA_SITE_URL` e `CRON_SECRET` e a variável `CRONICA_MAINTENANCE_ENABLED=true`, ou use um agendador compatível com seu plano.

As instruções detalhadas de agendamento e cotas estão em [Manutenção da 047](docs/historico/LEIA-ME-ATUALIZACAO-047.md#manutenção-frequente). O endpoint protegido continua `/api/billing/cron`. Nenhum agendador de produção foi ativado nesta entrega.

Ao enviar mudanças em `.github/workflows` para o GitHub, o token do Git precisa permitir a atualização de workflows. Esse é o ajuste de autenticação já identificado durante o envio da 047.

## Arquivos de referência

- `ALTERACOES-048.md`: o que esta etapa implementa.
- `VALIDACAO-048.md`: resultados finais de tipos, testes, navegador e instalação limpa.
- `MANIFESTO-048.json`: hashes dos arquivos distribuídos.
- `docs/arkanis-048.md`: campos, cálculos, fonte e limites da implementação.
- `docs/historico`: guias e validação da base anterior.
