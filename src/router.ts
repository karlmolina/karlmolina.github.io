import { html } from "htl";
import Navigo from 'navigo';

const router = new Navigo("/", { hash: true });



router
  .on("/tree", () => {
    document.title = "Tree";
  })
  .resolve();

export default router;
