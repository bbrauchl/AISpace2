<template>
  <div>
    <GraphVisualizerBase :graph="graph" :width="width" :height="height">
      <template slot="node" scope="props">
        <EllipseGraphNode :text="props.node.name" :textColour="nodeTextColour(props.node, props.hover)"
                          :subtext="showNodeHeuristics ? props.node.h.toFixed(1) : undefined"
                          :fill="nodeFillColour(props.node, props.hover)"
                          :stroke="nodeStroke(props.node)" :stroke-width="nodeStrokeWidth(props.node)"
                          @updateBounds="updateNodeBounds(props.node, $event)">
        </EllipseGraphNode>
      </template>
      <template slot="edge" scope="props">
        <DirectedEdge :x1="props.x1" :x2="props.x2" :y1="props.y1" :y2="props.y2" :stroke="props.edge.styles.stroke"
                      :strokeWidth="props.edge.styles.strokeWidth" :text="showEdgeCosts ? props.edge.cost : undefined"
                      :sourceRx="props.edge.source.styles.rx" :sourceRy="props.edge.source.styles.ry"
                      :targetRx="props.edge.target.styles.rx" :targetRy="props.edge.target.styles.ry">
        </DirectedEdge>
      </template>
    </GraphVisualizerBase>
    <div class="footer">
      <div id="controls" class="btn-group">
        <button id="fine-step" class="btn btn-default" @click="$emit('click:fine-step')">Fine Step</button>
        <button id="step" class="btn btn-default" @click="$emit('click:step')">Step</button>
        <button id="auto-step" class="btn btn-default" @click="$emit('click:auto-step')">Auto Step</button>
      </div>
      <div>{{output}}</div>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import Component from "vue-class-component";
import { Prop } from "vue-property-decorator";

import GraphVisualizerBase from "../../components/GraphVisualizerBase.vue";
import DirectedEdge from "../../components/DirectedEdge.vue";
import EllipseGraphNode from "../../components/EllipseGraphNode.vue";

import { Graph, ISearchGraphNode, ISearchGraphEdge } from "../../Graph";

@Component({
  components: {
    GraphVisualizerBase,
    DirectedEdge,
    EllipseGraphNode
  }
})
export default class SearchVisualizer extends Vue {
  /** The graph being visualized. */
  @Prop({ type: Object })
  graph: Graph<ISearchGraphNode, ISearchGraphEdge>;
  /** Text describing what is currently happening. */
  @Prop({ default: "" })
  output: string;
  /** True if edge costs should be shown on the edges. */
  @Prop({ default: true })
  showEdgeCosts: boolean;
  /** True if node heuristics should be shown on the nodes. */
  @Prop({ default: true })
  showNodeHeuristics: boolean;
  /** The width, in pixels, of the visualizer. */
  @Prop({ default: undefined })
  width: number;
  /** The width, in pixels, of the visualizer. */
  @Prop({ default: undefined })
  height: number;

  /** Events Emitted */
  /**
    * 'click:fine-step': The "fine step" button has been clicked.
    * 'click:step': The "step" button has been clicked.
    * 'click:auto-step': The "autostep" button has been clicked.
    */

  nodeFillColour(node: ISearchGraphNode, hover: boolean) {
    if (hover) {
      return "black";
    }

    switch (node.type) {
      case "search:start":
        return "orchid";
      case "search:goal":
        return "gold";
      default:
        return "white";
    }
  }

  nodeTextColour(node: ISearchGraphNode, hover: boolean) {
    if (hover) {
      return "white";
    }

    return "black";
  }

  nodeStroke(node: ISearchGraphNode) {
    if (node.styles && node.styles.stroke) {
      return node.styles.stroke;
    }

    return "black";
  }

  nodeStrokeWidth(node: ISearchGraphNode) {
    if (node.styles && node.styles.strokeWidth) {
      return node.styles.strokeWidth;
    }

    return 1;
  }

  /**
   * Whenever a node reports it has resized, update it's style so that it redraws.
   */
  updateNodeBounds(node: ISearchGraphNode, bounds: { rx: number, ry: number }) {
    node.styles.rx = bounds.rx;
    node.styles.ry = bounds.ry;
  }
}
</script>