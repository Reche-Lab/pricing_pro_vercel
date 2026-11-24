# Blog Ground Shop

## Acesso e escopo

- Público: `/loja/ground-shop/blog` ou `https://groundshop.com.br/blog` quando o domínio estiver autorizado.
- Preview autenticado: `/commerce/ground-shop/preview/blog`.
- Atalhos no menu, rodapé e uma seleção de histórias na home.
- Os oito artigos iniciais são exclusivos de `ground-shop`. Outros tenants começam com blog desativado e vazio, podendo criar seu próprio conteúdo.
- A edição administrativa exige a migration `0086_commerce_blog.sql`. Sem chave de IA ou nova dependência.

## Conteúdo editorial

Oito artigos iniciais, versionados em `src/content/ground-shop-blog.ts`, publicados em 24/11/2026. Temas: summits/eventos corporativos, medidas e preparação da arte, casamentos/espelhos, abridores, ímãs, chaveiros/onboarding, campanhas de conscientização e história dos bottons.

Em **Loja online → Blog**, o owner/admin pode editar a apresentação, substituir capas por upload e criar ou editar artigos. O editor inclui título, resumo, categoria, legenda/descrição da imagem, introdução, síntese, seções reordenáveis, dicas, perguntas, fontes e termos dos produtos relacionados. PNG, JPEG e WebP de até 3 MB usam o bucket `commerce-media` já existente.

**Salvar e publicar** aplica as mudanças à loja. **Rascunho** retira o artigo da loja e permite acesso somente pela prévia administrativa; **Arquivado** também retira da prévia. Salvar como rascunho um artigo já publicado o remove do ar, em vez de manter duas versões simultâneas. Os endereços de artigos existentes são preservados. Datas de publicação são preservadas e a atualização é registrada pelo servidor.

Os artigos originais continuam como ponto de partida. Apenas as alterações são gravadas em `commerce_blog_posts`; a apresentação fica em `commerce_blog_settings`. Rascunhos/arquivados sobrescrevem o original sem fazê-lo reaparecer no blog público. Antes da migration, a loja preserva o conteúdo inicial e o painel informa que o salvamento está indisponível.

O servidor verifica sessão administrativa, origem, tenant, tamanho, estrutura e limite de requisições. As tabelas têm RLS e não permitem acesso direto a `anon`/`authenticated`; a API não aceita IDs de outro tenant. Controle de revisão devolve 409 em edições concorrentes, com registro em `audit_logs`. Somente artigos publicados de blogs habilitados aparecem no sitemap e nas páginas públicas. A prévia autenticada inclui rascunhos sem indexá-los.

Não incluir preços estáticos, prazos prometidos, descontos universais, depoimentos inventados ou alegações de saúde. Os produtos relacionados vêm do catálogo real. As condições atuais permanecem na página do produto/pedido. Revisar textos e imagens com a equipe antes da publicação de novas histórias.

## Experiência e acessibilidade

Busca sem distinguir acentos, filtros por tema, favoritos apenas neste navegador, compartilhamento por cópia, sumário com âncoras, perguntas expansíveis, progresso de leitura e uma pausa criativa de sugestões locais. Nada gera chamadas de LLM. Interações por teclado/toque, estados de foco e respeito a `prefers-reduced-motion`. Temas claro/escuro herdados da loja.

## Descoberta

HTML renderizado no servidor, títulos e descrições individuais, canonical no domínio autorizado, Open Graph/Twitter, Blog/BlogPosting, autoria organizacional, datas explícitas e BreadcrumbList. Todas as histórias constam do sitemap existente, incluindo lastmod estável. Preview e loja pausada não são indexáveis. Imagens ficam sob `/studio/`, prefixo estático já permitido no domínio próprio.

Após o deploy: abrir `/blog`, inspecionar uma URL de artigo no Search Console e conferir o sitemap da loja. Conferir dados estruturados e relatórios de indexação. Não criar páginas duplicadas para filtros. Favorecer textos úteis e atualizações reais, não repetição artificial de palavras-chave.

SEO e permissão para crawlers não garantem posição, citação por IA ou inclusão em resultados enriquecidos. As regras privadas já existentes de robots continuam preservadas.

Referências técnicas consultadas em 24/11/2026:
- [Google: Article / BlogPosting](https://developers.google.com/search/docs/appearance/structured-data/article)
- [Google: boas práticas para busca generativa](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [OpenAI: crawlers de busca](https://developers.openai.com/api/docs/bots)
- [Smithsonian: Pin-Back Democracy](https://americanhistory.si.edu/explore/exhibitions/american-democracy/online/machinery-democracy/democratic-outfitting/pin-back-democracy)

## Imagens

Quatro composições ilustrativas originais geradas com a ferramenta imagegen, modo geração de imagem (não fotografias de pedidos/clientes reais). Otimizadas com Sharp para WebP de 1440 × 960, aproximadamente 112–226 KiB por arquivo. A legenda dos artigos diferencia inspiração de catálogo; nenhuma cena representa uma entrega ou evento real da empresa.

Arquivos em `public/studio/blog/ground-shop/`. Originais preservados no diretório de imagens geradas do Codex. Os prompts abaixo permitem manter a direção editorial ao produzir variantes:

### encontros.webp

Create a premium editorial still-life photograph for the Brazilian Ground Shop blog, landscape 3:2 composition. Realistic small ROUND pinback buttons (25mm to 55mm) on a vibrant muted turquoise desk, one silver metal pinback visible, several face-up buttons with beautifully simple abstract coral, lime and deep charcoal graphic shapes only, NO text or logos. A folded dark green conference lanyard, small paper agenda with no readable text and one pencil at the side suggest an intimate creative corporate summit preparation, not a fake actual event. Tactile paper and metal, soft natural side window light, subtle shadows, crisp inspectable product detail, warm authentic human craft, sophisticated art-directed editorial photography, no plastic 3D look, no people, no watermark. Keep principal buttons middle/right and uncluttered darker negative space at left for website headline overlay. Full bleed photographic composition.

### lembrancas.webp

Premium authentic editorial product photograph, landscape 3:2 for a Brazilian personalized gifts blog. Close tabletop still life showing a ROUND compact pocket mirror with a circular glass mirror one side and separate round printed cover nearby, a round metal bottle opener with its metal opener back visible, round keyring charm on a silver split ring, and two circular refrigerator magnets. All are small real tangible 40-60mm products from the same printed round-button family, no large handles, no square products. Simple playful blue, coral and yellow abstract prints, no lettering or brands. Deep berry red and pale lavender paper surfaces, casually placed linen ribbon and cream place card with no readable text evoke thoughtful wedding party favors. True photographic metal and glass reflections, natural light, beautiful texture, elegant handcrafted arrangements, no people, no holograms, no generic office stock imagery, no watermark. Clearly visible whole products, magazine quality.

### campanhas.webp

Landscape 3:2 magazine editorial macro photograph of carefully prepared round personalized buttons for inclusive workplace awareness campaigns. Small tactile round pinback buttons with diverse simple ORIGINAL abstract designs: coral pink line leaf, warm yellow sun, deep blue organic waves, charcoal cream geometric dots, absolutely no text, no ribbons that imply official charity affiliation, no brands. A few circles cut from printed paper and a transparent ruler with only mm lines on a cool off-white cutting mat; silver pinback visible on one flipped button. Human scale 25mm-55mm, clearly real curved metal pinback buttons, crisp printed colors and fine material detail. Side lighting, subtle shadow, lively but restrained vivid yellow, coral and blue palette, top down with slight angle, fresh and imaginative, not clinical or stock, no watermark. Leave a little clear space around products, full bleed.

### cotidiano.webp

Editorial lifestyle product still life landscape 3:2, close photograph of a real mint green refrigerator door with three SMALL ROUND personalized refrigerator magnets, each roughly 50mm in diameter, one matte deep blue with a simple original coral flower, one yellow with simple blue organic illustration, one cream with an abstract hand drawn smile and tiny colored dot pattern. No text no logos. They hold a handwritten blank-backed recipe note and a small color swatch paper, a brass round keychain charm on a hook nearby. Warm natural home daylight, subtle enamel texture, balanced light and dark product surfaces, tangible craftsmanship, human but no people, no invented brand affiliation. Crisp realistic printed magnets, casually charming not overly perfect, sophisticated Brazil design magazine style. Leave negative space at right, no watermarks.


## Verificação

- `npm run test:local -- src/tests/unit/commerce-blog.test.tsx src/tests/unit/commerce-institutional.test.tsx src/tests/unit/commerce-institutional-routes.test.tsx src/tests/unit/commerce-discovery-seo.test.ts src/tests/unit/store-footer.test.tsx src/tests/unit/store-category-navigation.test.tsx`
- `npm run typecheck`
- `node scripts/commerce-blog-browser.mjs` (Playwright instalado ou `COMMERCE_PLAYWRIGHT_PATH` e `COMMERCE_BROWSER_EXECUTABLE`). Fixture isolada usa os componentes reais e as imagens locais; não consulta banco nem serviços externos. Capturas em `/tmp/groundshop-blog-*.png`.
- `node scripts/commerce-blog-admin-browser.mjs`: editor administrativo real em 1440/768/390/320 px com repositório simulado, upload, salvamento, recarregamento e falha de concorrência. Sem gravações em tenants reais.
- `node scripts/commerce-blog-db-test.mjs`: exige `BLOG_TEST_PG_SOCKET` de um PostgreSQL descartável em `/tmp/pricing-blog-pg.*`, usuário `codex_blog`, porta 55486. Cria somente tabelas mínimas de teste e valida a migration, SQL real, isolamento, revisões concorrentes e permissões. Nunca usa `DATABASE_URL`; essa variável de teste não precisa ser configurada no deploy.

