import { timeout } from "d3";
import * as widgets from "@jupyter-widgets/base";
import { debounce } from "underscore";
import Vue from "vue";
import { IEvent, isOutputEvent } from "../Events";
import { Graph, ICSPGraphNode, IGraphEdge } from "../Graph";
import { d3ForceLayout, GraphLayout } from "../GraphLayout";
import * as StepEvents from "../StepEvents";
import CSPGraphVisualizer from "./components/CSPVisualizer.vue";
import CSPViewerModel from "./CSPVisualizerModel";
import * as Events from "./SearchVisualizerEvents";

export default class CSPViewer extends widgets.DOMWidgetView {
  private static readonly ARC_CLICK = "arc:click";
  private static readonly VAR_CLICK = "var:click";

  public model: CSPViewerModel;

  private vue: any;
  private graph: Graph<ICSPGraphNode>;

  public initialize(opts: any) {
    super.initialize(opts);

    this.graph = Graph.fromJSON(this.model.graphJSON) as Graph<ICSPGraphNode>;

    this.listenTo(this.model, "view:msg", (event: IEvent) => {
      // tslint:disable-next-line:no-console
      console.log(event);

      if (Events.isHighlightArcsEvent(event)) {
        this.highlightArcs(event);
      } else if (Events.isSetDomainsEvent(event)) {
        this.setDomains(event);
      } else if (Events.isHighlightNodesEvent(event)) {
        this.highlightNodes(event);
      } else if (Events.isChooseDomainSplitEvent(event)) {
        const domainString = window.prompt(
          "Choose domain for first split. Cancel to choose a default split.",
          event.domain.join()
        );
        const newDomain =
          domainString != null ? domainString.split(",").filter(d => d) : null;
        this.send({ event: "domain_split", domain: newDomain });
      } else if (isOutputEvent(event)) {
        this.vue.output = event.text;
      }
    });
  }

  public render() {
    timeout(() => {
      this.vue = new CSPGraphVisualizer({
        data: {
          graph: this.graph,
          layout: new GraphLayout(d3ForceLayout()),
          width: 0,
          height: 0,
          output: null
        }
      }).$mount(this.el);

      this.vue.$on("click:fine-step", () =>
        this.send({ event: StepEvents.FINE_STEP_CLICK })
      );
      this.vue.$on("click:step", () =>
        this.send({ event: StepEvents.STEP_CLICK })
      );
      this.vue.$on("click:auto-solve", () =>
        this.send({ event: StepEvents.AUTO_STEP_CLICK })
      );

      this.vue.$on("click:edge", (edge: IGraphEdge) => {
        this.send({
          constId: edge.target.idx,
          event: CSPViewer.ARC_CLICK,
          varName: edge.source.name
        });
      });

      this.vue.$on("click:node", (node: ICSPGraphNode) => {
        this.send({
          event: CSPViewer.VAR_CLICK,
          varName: node.name
        });
      });

      // Functions called on the Python backend are queued until first render
      if (!this.model.previouslyRendered) {
        this.send({ event: "initial_render" });
        this.highlightArcs({
          action: "highlightArcs",
          arcIds: null,
          colour: "blue",
          style: "normal"
        });
      }
    });

    return this;
  }

  public remove() {
    if (this.vue != null) {
      this.vue.$destroy();
    }
  }

  /**
   * Highlights an arc (or all arcs), as described by the event object.
   */
  private highlightArcs(event: Events.ICSPHighlightArcsEvent) {
    const strokeWidth = event.style === "bold" ? 7 : 4;

    if (event.arcIds == null) {
      for (const edge of this.graph.edges) {
        const stroke = event.colour ? event.colour : edge.styles.stroke;
        this.vue.$set(edge.styles, "stroke", stroke);
        this.vue.$set(edge.styles, "strokeWidth", strokeWidth);
      }
    } else {
      for (const arcId of event.arcIds) {
        const stroke = event.colour
          ? event.colour
          : this.graph.idMap[arcId].styles.stroke;
        this.vue.$set(this.graph.idMap[arcId].styles, "stroke", stroke);
        this.vue.$set(
          this.graph.idMap[arcId].styles,
          "strokeWidth",
          strokeWidth
        );
      }
    }
  }

  /**
   * Sets the domain of a variable node, as described by the event object.
   */
  private setDomains(event: Events.ICSPSetDomainsEvent) {
    for (let i = 0; i < event.nodeIds.length; i++) {
      const variableNode = this.graph.idMap[event.nodeIds[i]] as ICSPGraphNode;
      variableNode.domain = event.domains[i];
    }
  }

  /**
   * Highlights nodes, as described by the event object.
   */
  private highlightNodes(event: Events.ICSPHighlightNodesEvent) {
    for (const nodeId of event.nodeIds) {
      this.vue.$set(this.graph.idMap[nodeId].styles, "stroke", event.colour);
      this.vue.$set(this.graph.idMap[nodeId].styles, "strokeWidth", 2);
    }
  }
}