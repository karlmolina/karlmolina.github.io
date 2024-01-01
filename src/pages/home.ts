import { html } from 'htl'

export default (sketchList: string[]) => {
  const link = (name: string) =>
    html`<li class="my-2 sm:my-4">
      <a
        class="inline-block w-full text-2xl hover:bg-teal-100 sm:text-4xl"
        href="#/${name}"
        >${name}</a
      >
    </li>`
  return html`
    <div class="m-auto max-w-screen-lg px-8 pt-16 sm:px-16 sm:pt-24">
      <h1
        class="
          border-b-0.05em mb-1 mt-2 box-border break-words border-teal-500 font-[questrial] text-4xl font-normal tracking-tighter text-[#1A936F] underline sm:text-6xl md:text-8xl"
      >
        karlmolina.com
      </h1>
      <ul class="font-barlow my-4 list-none text-left text-[#114b5f]">
        ${sketchList.map((name) => link(name))}
      </ul>
    </div>
  `
}
