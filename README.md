# Rodrigo Andrade — personal website

Site pessoal estático, inspirado na estrutura acadêmica do site anterior: navegação no topo, perfil à esquerda e conteúdo à direita. HTML e CSS próprios; Node.js gera as páginas a partir de Markdown e JSON. O site funciona sem JavaScript no navegador.

## Rodar

Com Node.js 22 ou superior:

```sh
npm ci
npm run dev
```

Abra http://localhost:3000. Depois de editar o conteúdo, execute `npm run build` e atualize a página. `npm run preview` serve a última versão gerada.

## Editar o conteúdo

- `content/profile.json`: nome, contato, descrição, endereço do site e interesses.
- `content/about.md`: apresentação na página inicial. O texto inicial é um rascunho baseado nas informações do repositório anterior.
- `files/rodrigo-andrade-resume.pdf`: résumé em PDF, convertido do DOCX fornecido por Rodrigo. O link Resume aponta diretamente ao arquivo; substitua este PDF para atualizá-lo.
- `content/projects.json`: ordem, ano, categoria, título e resumo dos projetos.
- `content/publications.json`: publicações verificadas, separadas dos projetos pessoais. Vazio até haver trabalhos reais para incluir; a seção não aparece quando vazia.
- `content/writing.json` e `content/writing/<slug>.md`: artigos aprovados, com data, resumo e tags. Equações usam `$...$` ou `$$` em linhas separadas. Rascunhos privados ficam fora deste repositório público.
- `content/projects/<slug>.md`: descrição completa de cada projeto. Para adicionar um projeto, crie o Markdown e acrescente a entrada correspondente ao JSON.
- `images/` e `files/`: imagens e relatórios dos projetos.
- `assets/style.css`: visual responsivo.
- `scripts/build.mjs`: layout e geração das páginas.

Markdown aceita HTML e é tratado como conteúdo confiável do proprietário. Uma futura importação de fontes externas deve validar os dados e sanitizar HTML antes de gravá-lo aqui.

## Publicação

`npm run build` gera `dist/`, incluindo páginas dos projetos, redirecionamentos de `/about/`, `/about.html`, `/cv/` e `/resume/`, sitemap e página 404. `/cv/` e `/resume/` abrem o PDF. As URLs existentes `/portfolio/<slug>/` e os relatórios foram mantidos.

O workflow `.github/workflows/check.yml` testa propostas em pull requests. `.github/workflows/pages.yml` publica no GitHub Pages após um push aprovado em `main` ou `master`. Em Settings → Pages, a origem precisa estar definida como **GitHub Actions**. Nenhuma publicação é feita apenas ao editar este checkout. O processo de edição e aprovação está em [docs/editorial-workflow.md](docs/editorial-workflow.md).

## Próximos passos de conteúdo

Revisar a apresentação com Rodrigo; adicionar foto; desenvolver relatos dos trabalhos de pesquisa; revisar os relatos e resultados dos projetos. A apresentação, os contatos e o CV foram atualizados a partir de `Resume_Rodrigo_Andrade_Revised.docx`. Os projetos pessoais vieram do repositório anterior. Os arquivos de conteúdo já estão separados do layout para permitir uma futura importação de portfólio, com revisão antes de publicar. A automação de coleta ainda não foi implementada.

O tema Academic Pages e seus exemplos foram removidos; os três projetos pessoais e seus arquivos foram migrados. A versão anterior permanece no histórico Git. `LICENSE` preserva a licença original.

## Portfólio visual

Cada projeto tem mídia à esquerda e, à direita, ano, área, título, resumo e links. `media.image`, `media.alt` e `media.caption` definem foto e descrição. `media.position` ajusta o enquadramento no thumbnail via CSS. `links` contém objetos com `label` e `url`, apenas para recursos existentes.

Quando houver demonstração própria, `media.video` recebe o caminho do vídeo; o thumbnail passa a ser um player com controles, poster e sem autoplay. Não há botão de play nas imagens estáticas.

Publicações usam os mesmos campos visuais e acrescentam `authors` (lista de nomes), `venue` e `url` (página do trabalho). Inclua somente artigos cuja autoria e status estejam confirmados. As publicações aparecem antes dos projetos pessoais e não são tratadas como projetos independentes.

Referências de organização: [Tony Tao](https://tony-tao.com/), [Siyi Chen](https://chicychen.github.io/) e [Kevin Black](https://kevin.black/). O site adota a organização das informações; imagens e textos dos pesquisadores não foram reutilizados.

As fotos `images/solar-panel-tracker.jpg` e `images/newtonian-telescope.jpg` foram extraídas da página 5 dos respectivos relatórios em `files/`. A foto LEGO já estava no repositório.
