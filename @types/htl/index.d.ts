export const html: {
  <T extends HTMLElement>(...args: TaggedTemplateParams): T
  /** Renders the specified markup as a document fragment. */
  fragment(...args: TaggedTemplateParams): DocumentFragment
}

type TaggedTemplateParams = [
  template: { raw: readonly string[] | ArrayLike<string> },
  ...substitutions: unknown[],
]
