import * as d3 from "d3";
import { Graph, IGraph, IGraphEdge, IGraphNode } from "./Graph";

/**
 * Layout parameters used for laying out the graph.
 */
export interface IGraphLayoutParams {
  /** The available width for the graph. */
  width: number;
  /** The available height for the graph. */
  height: number;
}

/** A function that lays out a graph by assigning x and y properties to the nodes in the graph. */
type LayoutFunction = (
  graph: Graph,
  layoutParams: IGraphLayoutParams
) => Promise<void>;

/**
 * A graph layout configuration object that specifies layout functions to be called.
 *
 * - The `setup` function is called once on the graph, right before displaying.
 * - The `relayout` function is called subsequently; for example, when the graph has updated,
 *   or the window has been resized.
 *
 * @example
 * ```
 * new GraphLayout(d3ForceLayout());
 * new GraphLayout(d3ForceLayout(), d3TreeLayout({rootId: '1234'}));
 * ```
 */
export class GraphLayout {
  private setupLayoutFunction: LayoutFunction;
  private relayoutLayoutFunction: LayoutFunction;

  constructor(
    /**
     * Function that performs one-time setup before layout.
     *
     * This function is only called once before the graph is drawn for the first time.
     * If your graph layout algorithm never requires relayout when the graph is updated,
     * perhaps because nodes will be created at mouse position, you may assign
     * x and y positions as properties to each node datum right here.
     */
    setup: LayoutFunction,
    /**
     * Function that re-layouts the graph as a result of graph/layout param changes.
     *
     * This function is not called initially for the first render.
     * You may call this function from the setup function if necessary.
     * When the promise is resolved, the nodes of the graph should have assigned x, y positions.
     *
     * If not provided, defaults to the same layout function as `setup`.
     */
    relayout?: LayoutFunction
  ) {
    this.setupLayoutFunction = setup;
    this.relayoutLayoutFunction = relayout || this.setupLayoutFunction;
  }

  /**
   * Perform one-time, initial layout for the graph, right before displaying.
   *
   * @param graph The graph to perform layout on.
   * @param layoutParams Layout parameters that should be obeyed by the layout algorithm.
   */
  public setup(graph: Graph, layoutParams: IGraphLayoutParams) {
    return this.setupLayoutFunction(graph, layoutParams);
  }

  /**
   * Lays out the graph as a result of subsequent graph or layout param changes.
   *
   * While this can be the same layout algorithm as the one called during setup,
   * this is useful if, for example, you want to lay out the graph using a force layout initially,
   * but during resizing, you only want to scale their relative positions instead of recalculation.
   *
   * @param graph The graph to perform layout on.
   * @param layoutParams Layout parameters that should be obeyed by the layout algorithm.
   */
  public relayout(graph: Graph, layoutParams: IGraphLayoutParams) {
    return this.relayoutLayoutFunction(graph, layoutParams);
  }
}

/**
 * Creates a `LayoutFunction` that uses D3's force layout simulation.
 */
export function d3ForceLayout(): LayoutFunction {
  return (graph: IGraph, layoutParams: IGraphLayoutParams) => {
    /**
     * We will work with a copy of the graph to prevent D3 from adding
     * various additional properties, such as `vx` and `fy`, to our nodes.
     * Later, we'll copy over only the final x and y properties that we're interested in.
     */
    const graphCopy: IGraph = JSON.parse(JSON.stringify(graph));
    const forceSimulation = d3
      .forceSimulation(graphCopy.nodes)
      .force(
        "link",
        d3
          .forceLink()
          .id(node => (node as any).id)
          .links(graphCopy.edges)
      )
      .force("charge", d3.forceManyBody().strength(-35))
      .force(
        "center",
        d3.forceCenter(layoutParams.width / 2, layoutParams.height / 2)
      )
      .force("collision", d3.forceCollide(60))
      .stop();

    const edgePadding = 50;

    return new Promise<void>((resolve, reject) => {
      // Run simulation synchronously the default number of times (300)
      for (let i = 0, ticksToSimulate = 300; i < ticksToSimulate; i++) {
        forceSimulation.tick();

        // Bound nodes to SVG
        graphCopy.nodes.forEach(node => {
          node.x = Math.max(
            edgePadding,
            Math.min(layoutParams.width - edgePadding, node.x!)
          );
          node.y = Math.max(
            edgePadding,
            Math.min(layoutParams.height - edgePadding, node.y!)
          );
        });
      }

      scaleNodePositions(layoutParams, graph.nodes);
      // Copy over x and y positions onto original graph once simulation is finished
      // if the node did not already have an x, y position
      graphCopy.nodes.forEach((node, i) => {
        if (!graph.nodes[i].x) {
          graph.nodes[i].x = node.x;
        }
        if (!graph.nodes[i].y) {
          graph.nodes[i].y = node.y;
        }
      });
      resolve();
    });
  };
}

/**
 * Creates a `LayoutFunction` that uses D3's tree layout. All nodes of the same depth are placed at the same level.
 */
export function d3TreeLayout(
  opts: {
    /** The ID of the node that should root the tree. If not provided, uses the first node of the graph. */
    rootId?: string;
  } = {}
): LayoutFunction {
  return (graph: IGraph, layoutParams: IGraphLayoutParams) => {
    if (graph.nodes.length === 0) {
      return Promise.resolve();
    }

    /** Maps IDs to nodes */
    const nodeMap: { [key: string]: IGraphNode } = {};
    for (const node of graph.nodes) {
      nodeMap[node.id] = node;
    }

    const nodeMapInTree: { [key: string]: IGraphNode } = {};

    interface IHierarchyNode {
      node: IGraphNode;
      children: IHierarchyNode[];
    }

    let rootNode = graph.nodes.find(n => n.id === opts.rootId);
    if (rootNode == null) {
      rootNode = graph.nodes[0];
    }

    const rootData = {
      node: rootNode,
      children: []
    } as IHierarchyNode;

    /** Map node IDs to their data in the hierarchy. Can quickly add children to parent. */
    const map = {
      [rootNode.id]: rootData
    };

    for (const edge of graph.edges) {
      if (!(edge.target.id in map)) {
        const data = {
          node: nodeMap[edge.target.id],
          children: []
        } as IHierarchyNode;

        map[edge.target.id] = data;
      }

      // Parent not in map
      if (!(edge.source.id in map)) {
        const data = {
          node: nodeMap[edge.source.id],
          children: []
        } as IHierarchyNode;

        map[edge.source.id] = data;
      }

      if (
        map[edge.target.id].children.some(c => c.node.id === edge.source.id) || edge.target.id in nodeMapInTree
      ) {
        // There is already an arrow the other way
        // Note that while this prevents endless loops, the tree layout is not designed
        // to work with general graphs, and thus the resulting layout may be very odd
        continue;
      }

      // Add target to source's children
      nodeMapInTree[edge.target.id] = nodeMap[edge.target.id];
      map[edge.source.id].children.push(map[edge.target.id]);
    }

    return new Promise<void>((resolve, reject) => {
      const treeLayout = d3.tree();
      const root = d3.hierarchy(rootData);
      treeLayout(root); // Sets x and y positions, in [0, 1] range

      let maxDepth = 0;
      root.descendants().forEach(n => {
        if (n.depth > maxDepth) {
          maxDepth = n.depth;
        }
      });

      /**
       * Tree layout has a tendency to fill the y-axis, e.g. if you have a parent and a child node,
       * it will place the parent at the top and child at the bottom. This takes up more space then is often necessary.
       * To make this look better, we divide the available height into `maxDepth + 1` equal sections,
       * and place the nodes along those dividing lines. This tends to look better, while still filling
       * the whole area when the depth is high enough.
       */
      const heightDivision = layoutParams.height / (maxDepth + 2);

      const sameLeveNodesList: IGraphNode[][] = [];
      for (let i = 0; i <= maxDepth; i++){
        const list: IGraphNode[] = [];
        sameLeveNodesList.push(list);
      }

      root.each(n => {
        sameLeveNodesList[n.depth].push(n.data.node);
        n.data.node.x = (n as any).x * layoutParams.width;
        n.data.node.y =
          (n as any).y *
            (layoutParams.height - heightDivision - heightDivision) +
          heightDivision;
      });

      sameLeveNodesList.forEach(sameLevelNodes => {

        const newradius: number = (layoutParams.width / sameLevelNodes.length) / 2 - 15;

        // If there are too many nodes in same level, just use minimum node radius.
        if (newradius <= 0) {
          sameLevelNodes.forEach(node => {
            node.styles.radius = 1;
          });
        } else {
          // Caculate positions for same level nodes to be not overlapping.
          sameLevelNodes.forEach(node => {
            if (newradius >= 50) {
              node.styles.radius = 50;
            }
            if (newradius < 50 && newradius > 0) {
              node.styles.radius = newradius;
            }
            node.x = (2 * sameLevelNodes.indexOf(node) + 1) * (newradius + 15);
          });
        }
      });

      /**
       * Deal with overlapped edges:
       * To make sure that two overlapped edges are splitted and always maintain parallel,
       * Need to make two fake nodes (x1,y1) (x2,y2) moving alone circles centered at the target and source nodes.
       */ 
      graph.edges.forEach(edge => {
        edge.x1 = edge.source.x;
        edge.x2 = edge.target.x;
        edge.y1 = edge.source.y;
        edge.y2 = edge.target.y;
      });

      graph.edges.forEach(e1 => {
        graph.edges.forEach(e2 => {
          if (e1.source === e2.target &&
            e1.target === e2.source &&
            e1.styles.x1 === e2.styles.x2 &&
            e1.styles.x2 === e2.styles.x1) {
              e1.styles.overlapped = true;
              e2.styles.overlapped = true;
              const xa = e1.source.x;
              const ya = e1.source.y;
              const xb = e1.target.x;
              const yb = e1.target.y;
              const radius = 5;
              const cos: number = (yb! - ya!) / Math.sqrt(Math.pow((yb! - ya!), 2) + Math.pow((xb! - xa!), 2));
              const sin: number = (xb! - xa!) / Math.sqrt(Math.pow((yb! - ya!), 2) + Math.pow((xb! - xa!), 2));
              // Move both of the two overlapped edge from the original position
              e2.styles.x1 = cos * radius + xb!;
              e2.styles.x2 = cos * radius + xa!;
              e2.styles.y1 = yb! - sin * radius;
              e2.styles.y2 = ya! - sin * radius;
              e1.styles.x1 = xa! - cos * radius;
              e1.styles.x2 = xb! - cos * radius;
              e1.styles.y1 = sin * radius + ya!;
              e1.styles.y2 = sin * radius + yb!;
            }
        })
      });

      resolve();
    });
  };
}

/**
 * Creates a `LayoutFunction` that takes existing node positions and scales them to a new width/height.
 *
 * This should not be used as a setup function, because it depends on nodes already having a position.
 * Instead, use this for re-layout, where you don't want to recompute a more expensive layout,
 * and instead just move nodes to fill the new available space. This layout always moves nodes
 * to fill the entire width/height, ignoring the previous proportion of empty space.
 */
export function relativeLayout() {
  return (graph: Graph, layoutParams: IGraphLayoutParams) => {
    return new Promise<void>((resolve, reject) => {
      scaleNodePositions(layoutParams, graph.nodes);
      resolve();
    });
  };
}
// recalculate node positions so that nodes occupy the whole canvas
function scaleNodePositions(
  layoutParams: IGraphLayoutParams,
  nodes: IGraphNode[]
) {
  // Compute min and max X/Y
  let minX = Number.MAX_SAFE_INTEGER;
  let minY = Number.MAX_SAFE_INTEGER;
  let maxX = Number.MIN_SAFE_INTEGER;
  let maxY = Number.MIN_SAFE_INTEGER;

  for (const node of nodes) {
    if (!node.x || !node.y) {
      continue;
    }

    maxX = Math.max(node.x, maxX);
    maxY = Math.max(node.y, maxY);
    minX = Math.min(node.x, minX);
    minY = Math.min(node.y, minY);
  }

  const edgePadding = 60;

  for (const node of nodes) {
    // Scale node positions to fit new width/height, plus some edge padding
    if (!node.x || !node.y) {
      continue;
    }

    node.x =
      ((layoutParams.width - edgePadding * 2) * (node.x! - minX)) /
        (maxX - minX) +
      edgePadding;
    node.y =
      ((layoutParams.height - edgePadding * 2) * (node.y! - minY)) /
        (maxY - minY) +
      edgePadding;
  }
}
