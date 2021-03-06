<template>
  <div tabindex="0" @keydown.stop class="csp_visualizer">
    <GraphVisualizerBase :graph="graph" @click:node="nodeClicked" @click:edge="edgeClicked" :layout="layout" :transitions="true" :textSize="textSize">
      <template slot="node" slot-scope="props">
        <RoundedRectangleGraphNode :text="props.node.name" :textSize="textSize" :subtext= "probGraph(props.node)"
                                   :textColour="props.hover ? 'white' : 'black'" :fill="props.hover ? 'black' : 'white'"
                                   :hover="props.hover" :id="props.node.id" :detailLevel="detailLevel" @updateBounds="updateNodeBounds(props.node, $event)"
                                   :stroke-width="nodeStrokeWidth(props.node)" style="white-space: pre;">
        </RoundedRectangleGraphNode>
      </template>
      <template slot="edge" slot-scope="props">
        <DirectedRectEdge :id="props.edge.id" :x1="props.edge.source.x" :x2="props.edge.target.x" :y1="props.edge.source.y" :y2="props.edge.target.y" :stroke="props.edge.styles.stroke"
                          :strokeWidth="strokeWidth(props.edge, props.hover)" :nodeName="props.edge.target.name"
                          :graph_node_width="props.edge.styles.targetWidth" :graph_node_height="props.edge.styles.targetHeight">
        </DirectedRectEdge>
      </template>
      <template slot="visualization" slot-scope="props">
        <a class="inline-btn-group" @click="detailLevel = detailLevel > 0 ? detailLevel - 1 : detailLevel">&#8249;</a>
        <label class="inline-btn-group">Detail: {{detailLevel}}</label>
        <a class="inline-btn-group" @click="detailLevel = detailLevel < 2 ? detailLevel + 1 : detailLevel">&#8250;</a>

        <a class="inline-btn-group" @click="textSize = textSize - 1">-</a>
        <label class="inline-btn-group">Size: {{textSize}}</label>
        <a class="inline-btn-group" @click="textSize = textSize + 1">+</a>

        <a class="inline-btn-group" @click="decimalPlace = decimalPlace - 1">-</a>
        <label class="inline-btn-group">Decimal: {{decimalPlace}}</label>
        <a class="inline-btn-group" @click="decimalPlace = decimalPlace + 1">+</a>
      </template>
    </GraphVisualizerBase>
    <div>
      <span>
        <strong>Mode:</strong>
      </span>
      <span>
        <span class="radioInputGroup">
          <input type="radio" id="observe" value="observe" v-model="mode" />
          <label for="observe">Observe</label>
        </span>
        <span class="radioInputGroup">
          <input type="radio" id="query" value="query" v-model="mode" />
          <label for="query">Query</label>
        </span>
      </span>
    </div>
    <div>
      <div id="controls" class="btn-group">
        <button id="print-positions" class = "btn btn-default" @click="$emit('click:print-positions')">Print Positions</button>
        <button id="reset" class = "btn btn-default" @click="$emit('reset')">Reset</button>
      </div>
      <div class="output">{{output}}</div>
      <div v-if="FocusNode.domain.length > 0 && !isQuerying">
        <div>Current variable: <span class="nodeText">{{FocusNode.nodeName}}</span>.</div>
        <div>Choose a value to observe:</div>
        <div v-for="(key, index) in FocusNode.domain" :key = "key">
          <input type="radio" :id="key" :value= "key" v-model="FocusNode.checkedNames" :checked="index==0">
          <label :for="key">{{key}}</label>
        </div>
        <button id="submitCheckBox" class = "btn btn-default" @click="$emit('click:submit')">Submit</button>
      </div>
      <div v-if="warningMessage" class="warningText">{{warningMessage}}</div>
      <div class="output">{{positions}}</div>
    </div>
  </div>
</template>

<script lang="ts">
  import Vue from "vue";
  import Component from "vue-class-component";
  import { Prop, Watch } from "vue-property-decorator";

  import RoundedRectangleGraphNode from "../../components/RoundedRectangleGraphNode.vue";
  import GraphVisualizerBase from "../../components/GraphVisualizerBase.vue";
  import RectangleGraphNode from "../../components/RectangleGraphNode.vue";
  import DirectedRectEdge from "../../components/DirectedRectEdge.vue";

  import {Graph, IBayesGraphNode, IGraphEdge} from "../../Graph";
  import { GraphLayout } from "../../GraphLayout";

  /**
   * A Bayesian Network visualization that can be driven by backend code.
   *
   * Events Emitted
   * - 'click:edge': An edge has been clicked. The first argument is the edge.
   * - 'click:fine-step': The "fine step" button has been clicked.
   * - 'click:step': The "step" button has been clicked.
   * - 'click:auto-solve': The "auto solve" button has been clicked.
   * - 'click:submit': User chooses node domain to observe.
   */
  @Component({
    components: {
      RoundedRectangleGraphNode,
      GraphVisualizerBase,
      RectangleGraphNode,
      DirectedRectEdge
    }
  })
  export default class BayesNetInteractor extends Vue {

    // The graph being displayed
    graph: Graph;
    // The initial graph used for resetting
    iniGraph: Graph;
    // Text describing what is currently happening
    output: string;
    // Text descrbing warnings
    warningMessage: string;
    // The text representing the positions for nodes
    positions: string;
    // Layout object that controls where nodes are drawn
    layout: GraphLayout;
    // The size of the text inside the node
    textSize: number;
    // detail of the domain
    detailLevel: number;
    // If true, node click will query the node's probability
    // If False, node click will make observation
    isQuerying: boolean;
    // the number of decimal places to show for the node's probability
    decimalPlace: number;
    // the checkboxs of node
    data() {
      return {
        FocusNode:{
          domain:[],
          checkedNames: '',
          nodeName: String
        },
        mode: "observe"
     }
    }

    edgeClicked(edge: IGraphEdge) {
      this.$emit("click:edge", edge);
    }

    nodeClicked(node: IBayesGraphNode) {
      if (this.isQuerying) {
        this.$emit("click:query-node", node);
        node.displaying = true;
      } else {
        this.FocusNode.domain = node.domain;
        this.FocusNode.nodeName = node.name;
        if (node.domain) {
            this.FocusNode.checkedNames = node.domain[0];
        } else {
            this.FocusNode.checkedNames = '';
        }
      }
    }

    strokeWidth(edge: IGraphEdge, isHovering: boolean) {
      const hoverWidth = isHovering ? 3 : 0;

      if (edge.styles && edge.styles.strokeWidth) {
        return edge.styles.strokeWidth + hoverWidth;
      }

      return 4 + hoverWidth;
    }

    /** Properties for text button for visualization */
    get textBtnProp() {
      return {
        width: 30,
        height: 30,
        y: 20
      };
    }

    nodeStrokeWidth(node: IBayesGraphNode) {
      if (node.styles && node.styles.strokeWidth) {
        return node.styles.strokeWidth;
      }

      return undefined;
    }

    // Returns a formatted string graph representing the probability of a variable node after query
    probGraph(node: IBayesGraphNode) {
      let text = "";
      if (node.displaying != undefined && node.displaying !== false ) {
          if (node.prob !== undefined) {
              if (node.observed !== undefined) {
                  text += "Observation: " + node.observed + '\n';
              }
              text += "_".repeat(30) + '\n';
              var prob = "|";
              var width = 20;
              for (var key in node.prob) {
                  var number = node.prob[key];
                  var namel  = key.length;
                  text += key + " ".repeat(width - 10 - namel) + number.toFixed(this.decimalPlace) + ":" + " ".repeat(5) + prob.repeat(number*20) + " ".repeat(width-number*20) + '\n';
              }
              return text;
          }
      }
      text += node.domain.join(',');
      if (node.observed !== undefined) {
          text += '\n' + "Observation: " + node.observed;
      }
      return text;
    }

    addTextSize(){
      this.textSize ++;
    }

    minusTextSize(){
      if(this.textSize > 0) this.textSize --;
    }

    @Watch("mode")
    onModeChange(newVal: string) {
        if (newVal === "query") {
            this.isQuerying = true;
        } else {
            this.isQuerying = false;
        }
        this.FocusNode.domain = [];
    }

    // Whenever a node reports it has resized, update it's style so that it redraws.
    updateNodeBounds(node: IBayesGraphNode, bounds: { width: number; height: number }) {
      node.styles.width = bounds.width;
      node.styles.height = bounds.height;
      this.graph.edges
        .filter(edge => edge.target.id === node.id)
        .forEach(edge => {
          this.$set(edge.styles, "targetWidth", bounds.width);
          this.$set(edge.styles, "targetHeight", bounds.height);
        });
    }

  }

</script>
