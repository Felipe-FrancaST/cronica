# Crônica

Plataforma de campanhas de RPG em português, com identidade visual medieval original. Next.js, React, TypeScript, Tailwind CSS e Supabase. Preparada para hospedagem na Vercel.

**Status da entrega:** o código, as migrações e a demonstração estão implementados. A aplicação ainda precisa ser conectada ao seu projeto Supabase e publicada na sua conta Vercel. Nenhuma conta externa ou banco em produção foi criado nesta entrega.

## Começar no seu computador

Requisitos: Node.js 22 ou superior e npm.

1. Extraia o arquivo ZIP e abra a pasta `cronicarpg` no terminal.
2. Instale as dependências:

   ```bash
   npm ci
   ```

3. Copie `.env.example` para `.env.local`.
4. Para explorar sem configurar uma conta externa, deixe as duas variáveis Supabase vazias e use `NEXT_PUBLIC_ENABLE_DEMO=true`.
5. Inicie:

   ```bash
   npm run dev
   ```

6. Abra http://localhost:3000.

Em desenvolvimento, a demonstração também fica disponível automaticamente quando o Supabase não está configurado. Em um build de produção, ela exige a variável explícita `NEXT_PUBLIC_ENABLE_DEMO=true` e permanece desativada por padrão. Quando o Supabase está configurado, a aplicação usa exclusivamente a autenticação e o banco reais.

Na demonstração, Arthur Valença é mestre de duas campanhas e jogador de uma terceira. Trocar o modo mantém a mesma conta. Os jogadores de exemplo são `marina@cronica.demo`, `lucas@cronica.demo` e `sofia@cronica.demo`. As mudanças ficam apenas no navegador; Configurações permite restaurar os exemplos. A demonstração não envia emails nem autentica pessoas reais.

## Conectar o Supabase

Crie um projeto Supabase novo para a aplicação. O usuário de autenticação vem de `auth.users`; a tabela pública `profiles` é criada e atualizada automaticamente por gatilhos.

Escolha **uma** destas opções para executar as migrações:

**CLI do Supabase:**

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

**SQL Editor:** abra `supabase/schema.sql`, copie seu conteúdo completo para o SQL Editor do projeto e execute uma vez. Esse arquivo reúne as mesmas migrações, na ordem correta. Você não precisa criar tabelas manualmente. Não execute o arquivo depois de já aplicar as migrações pela CLI.

As sete migrações criam as tabelas, foreign keys, índices, gatilhos, RLS, funções transacionais, cadastro inicial do D&D, bucket privado, Realtime e o domínio da mesa tática. Não criam campanhas ou contas de demonstração no banco real.

Em `.env.local`, preencha:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_OU_PUBLISHABLE
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ENABLE_DEMO=false
```

A chave anon/publishable é a chave pública da aplicação; todas as operações ficam sujeitas ao usuário autenticado e às políticas RLS. **Não use `service_role` ou chave secreta nessas variáveis.** Não há chave administrativa no projeto, e `.env.local` fica fora do Git.

Em Authentication → URL Configuration, defina a Site URL e autorize os retornos:

- `http://localhost:3000/auth/callback`
- `http://localhost:3000/auth/callback?next=/alterar-senha`
- As mesmas URLs com o domínio final da Vercel.

Mantenha confirmação de email e senha mínima de 8 caracteres. Para links de confirmação que funcionam entre dispositivos, use nos templates de email:

**Confirmação de cadastro:**

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
```

**Recuperação de senha:**

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

O aplicativo também aceita o fluxo PKCE pela rota `/auth/callback`. O `proxy.ts` renova e verifica a sessão com Supabase Auth. Cadastro, login, logout, recuperação, alteração de senha, perfil e sessão persistente estão implementados; o recebimento de emails depende da configuração do serviço Auth/SMTP do seu projeto.

## Publicar na Vercel

1. O projeto já inclui um repositório Git local, com a primeira versão na branch `main`. Crie um repositório remoto na sua conta e envie a branch.
2. Importe esse repositório na Vercel. A pasta raiz é a pasta que contém `package.json`.
3. O framework é **Next.js**. Instalação: `npm ci`. Build: `npm run build`.
4. Cadastre as quatro variáveis do `.env.example` nos ambientes apropriados da Vercel. Use a URL final em `NEXT_PUBLIC_SITE_URL` e deixe a demonstração desativada.
5. Publique e ajuste a Site URL e as URLs autorizadas no Supabase para o domínio publicado.
6. Cadastre duas contas reais e siga o fluxo abaixo para validar a conexão completa.

Não há servidor Express, Firebase ou outro backend. A Vercel executa o Next.js e as rotas de autenticação; banco, Auth, arquivos e regras de acesso pertencem ao Supabase.

## Fluxo principal

**Mestre:** cadastro → confirmação → login → escolher Mestre → criar campanha → adicionar o email de uma conta cadastrada → construir mundo e NPCs → administrar fichas.

**Jogador:** cadastro → confirmação → login → escolher Jogador → abrir a campanha vinculada → criar personagem → editar e salvar a ficha.

Adicionar por email cria o relacionamento imediatamente. Não envia um convite e não cria usuário inexistente. Remover um jogador revoga seu acesso, preserva suas fichas para o mestre e permite recuperar o acesso se ele for adicionado novamente.

## Funcionalidades

| Área | Implementação |
| --- | --- |
| Conta | Cadastro, login/logout, recuperação/alteração de senha, avatar e preferências |
| Entrada | Modos Mestre e Jogador na mesma conta |
| Campanhas | Criação, edição, capa, sistema, tema, busca, status e exclusão confirmada |
| Jogadores | Vínculo por email existente, lista, avatar, ficha, data e remoção confirmada |
| Personagens | Ficha completa, inventário, moedas, magias, habilidades, condições e história |
| D&D 5e | Seis atributos, 18 perícias, proficiência/especialização, salvaguardas, CA, iniciativa, PV, dados de vida e espaços de magia |
| Mundo | Regiões, cidades e locais; relações, imagens, visibilidade e notas privadas separadas |
| NPCs | Identidade, história, facção, atributos, HP, CA, ataques, magias, resistências, fraquezas e inventário |
| Mídia | Uploads JPG/PNG/WebP até 5 MB no Supabase Storage privado |
| Interface | Desktop, tablet/celular, navegação adaptada, estados vazios, erros, carregamento e sucesso |
| Mesa tática | Three.js 3D com alternativa 2D, câmera orbital, sombras, mapas privados, grid configurável, tokens, A*, terrenos, bloqueios, iniciativa, turnos, histórico e Realtime |
| Futuro | Sessões narrativas e itens continuam reservados; a cena tática já inclui estrutura lógica para objetos, `z`, visão e futuras ferramentas de cenário |

Os cálculos cobrem a ficha básica de uma classe única, níveis 1–20, do SRD 5.1. PV usam valor máximo no primeiro nível e média nos demais, com campo para substituir o máximo. Armadura e escudo equipados alteram a CA. Magias são cadastradas na ficha com nível, componentes, alcance, duração, descrição e preparação; os espaços e bônus da classe são calculados automaticamente. Dados de raça e classe não distribuem automaticamente os atributos escolhidos pelo jogador.

Talentos, subclasses, multiclasse e efeitos específicos são registrados em habilidades e campos de ajuste; não há um motor completo para automatizar todas as exceções do D&D. A seleção de especialização deve seguir as habilidades da ficha. Encumbrância e efeitos de condições não são aplicados automaticamente. Não foram implementados rolagens de dados, chat, pagamentos, marketplace, IA, assinaturas ou aplicativo nativo. A mesa tática 3D, vista 2D alternativa, tokens e combate por turnos estão implementados. Efeitos de magia, fog of war, linha de visão e modelagem livre de cenário continuam preparados na arquitetura, sem interface final. Consulte `docs/vtt.md` para os controles e a atualização do VTT.

## Segurança e persistência

- UUIDs e foreign keys em todos os relacionamentos; timestamps e índices nas consultas de campanha, dono e visibilidade.
- RLS em todas as tabelas públicas, incluindo mapas, células, objetos de cena, tokens, turnos e histórico. O modo visual não define autorização: permissões usam `auth.uid()` e relacionamentos reais.
- Jogador consulta apenas campanhas vinculadas e suas próprias fichas; mestre consulta/administra os registros das próprias campanhas.
- NPC privado e seus filhos ficam inacessíveis mesmo com o UUID conhecido.
- Segredos do mundo ficam em tabelas `*_private`, com RLS exclusiva do mestre. Não são enviados aos jogadores.
- RPC de email verifica o mestre antes de resolver uma conta; funções de ficha, mundo e NPC usam os privilégios/RLS do chamador.
- Fichas, itens, atributos e magias são salvos em uma transação. Uma versão antiga da ficha é rejeitada quando outra sessão já a atualizou.
- Uploads usam caminhos específicos da entidade, como `npcs/UUID/arquivo.webp`. Estar na campanha não dá acesso à imagem de um NPC privado.
- O bucket `campaign-media` é privado. Imagens usam URLs assinadas com validade de 15 minutos. URLs já emitidas permanecem válidas até expirar; não compartilhe essas URLs fora da campanha.
- Realtime atualiza registros quando disponível; recarregamento ao retornar à aba e a cada 30 segundos garante uma alternativa.
- Excluir registros revoga novas leituras de mídia. Objetos substituídos ou órfãos não são removidos fisicamente nesta versão; a limpeza deve usar a API Storage em uma rotina administrativa, sem excluir metadados diretamente por SQL.

## Organização e novos sistemas

```text
src/app/                    Rotas Next.js, layout e autenticação
src/components/             Interface e formulários reutilizáveis
src/hooks/                  Sessão, estado e carregamento de mídia
src/services/               Repositórios Supabase, demonstração e Storage
src/lib/supabase/            Clientes do navegador e servidor
src/types/                  Entidades de campanha, usuário e mundo
src/systems/types.ts         Contrato genérico dos módulos
src/systems/registry.ts      Registro e resolução por slug
src/systems/dnd5e/           Tipos, catálogos, cálculos e editor D&D
src/features/vtt/            Domínio, A*, renderer 3D/2D, repositório e UI da mesa tática
supabase/migrations/        Migrações versionadas do PostgreSQL
tests/                      Regras, autorização e fluxos de navegador
public/                     Identidade e imagem original da campanha
```

Campanhas se relacionam com `rpg_systems`; personagens usam metadados comuns, atributos/perícias relacionados e `system_data` extensível. `Character<TSheet>` e `RpgSystemModule<TSheet,TDerived>` permitem fichas distintas. O serviço de leitura delega a reconstrução da ficha ao módulo correspondente.

Para adicionar outro sistema: implemente seu módulo/catálogos/cálculos/hidratação, registre seu slug em `registry.ts`, adicione seu editor em `SystemCharacterEditor` e cadastre uma linha em `rpg_systems` por migração. Adicione validações específicas do sistema às RPCs, usando a ramificação por slug; preserve as políticas de acesso comuns. Sistemas que exijam relações adicionais podem acrescentar tabelas com as mesmas regras de campanha/dono. O núcleo de campanhas, usuários, membros, mundo e Storage não precisa ser reescrito.

## Validação

```bash
npm run typecheck
npm test
npm run build
```

Os testes SQL executam todas as migrações em PostgreSQL local via PGlite, com schemas de Auth/Storage simulados e papéis que não podem ignorar RLS. Verificam acesso por campanha, fichas próprias, IDs privados, filhos de NPC, segredos, alteração de contextos, resolução por email, Storage, rollback, versões antigas e revogação de acesso.

Para os fluxos de navegador, habilite a demonstração, mantenha a aplicação aberta em outro terminal e execute:

```bash
npx playwright install chromium
npm run test:e2e
```

A suíte inclui testes de regras/SQL e testes específicos do VTT para pathfinding, terreno, diagonais, conversão de unidades, autoridade de token, turnos e concorrência otimista. Execute os três comandos acima no seu ambiente após `npm ci`; Auth/email, API HTTP do Supabase, upload remoto e deploy Vercel dependem das suas contas e devem ser validados contra o projeto real.

Antes de usar com sua mesa, valide com duas contas reais: vínculo por email, edição de HP pelo mestre aparecendo para o jogador e rejeição de acesso direto aos registros privados.

## Créditos e referências

Identidade Crônica e arte da fortaleza criadas para este projeto. Arte original gerada com ImageGen. Fontes Cinzel e Inter distribuídas através do Fontsource, sob suas respectivas licenças. Ícones Lucide e componentes acessíveis Radix UI. Renderização 3D com Three.js, distribuído sob licença MIT.

As regras básicas são baseadas no **System Reference Document 5.1**, de Wizards of the Coast, disponível em https://www.dndbeyond.com/srd, licenciado sob **Creative Commons Attribution 4.0 International**: https://creativecommons.org/licenses/by/4.0/. Os nomes de campos e alguns termos foram traduzidos para português. A aplicação não é afiliada a Wizards of the Coast.

- Three.js: https://threejs.org/docs/
- Next.js: https://nextjs.org/docs
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Vercel/Next.js: https://vercel.com/docs/frameworks/full-stack/nextjs
